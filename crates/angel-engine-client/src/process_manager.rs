use std::collections::{HashMap, HashSet};

use listeners::{Protocol, SocketState};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use crate::{ClientError, ClientResult};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubprocessInfo {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub command: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListeningPortInfo {
    pub pid: u32,
    pub port: u16,
    pub address: String,
}

pub fn list_subprocesses(root_pid: u32) -> ClientResult<Vec<SubprocessInfo>> {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
    );

    if system.process(Pid::from_u32(root_pid)).is_none() {
        return Err(ClientError::InvalidInput {
            message: format!("process {root_pid} was not found"),
        });
    }

    let mut children = HashMap::<u32, Vec<u32>>::new();
    for (pid, process) in system.processes() {
        if let Some(parent_pid) = process.parent() {
            children
                .entry(parent_pid.as_u32())
                .or_default()
                .push(pid.as_u32());
        }
    }
    for child_pids in children.values_mut() {
        child_pids.sort_unstable();
    }

    let mut subprocesses = Vec::new();
    collect_descendants(root_pid, &system, &children, &mut subprocesses);
    Ok(subprocesses)
}

pub fn list_listening_ports(pids: &[u32]) -> ClientResult<Vec<ListeningPortInfo>> {
    let pids = pids.iter().copied().collect::<HashSet<_>>();
    let listeners = listeners::get_all().map_err(|error| ClientError::InvalidInput {
        message: format!("failed to enumerate listening ports: {error}"),
    })?;
    let mut ports = listeners
        .into_iter()
        .filter(|listener| {
            pids.contains(&listener.process.pid)
                && listener.protocol == Protocol::TCP
                && listener.state == SocketState::Listen
        })
        .map(|listener| ListeningPortInfo {
            pid: listener.process.pid,
            port: listener.socket.port(),
            address: listener.socket.ip().to_string(),
        })
        .collect::<Vec<_>>();
    ports.sort_by(|left, right| {
        (left.pid, left.port, &left.address).cmp(&(right.pid, right.port, &right.address))
    });
    Ok(ports)
}

fn collect_descendants(
    parent_pid: u32,
    system: &System,
    children: &HashMap<u32, Vec<u32>>,
    subprocesses: &mut Vec<SubprocessInfo>,
) {
    for child_pid in children.get(&parent_pid).into_iter().flatten() {
        let Some(process) = system.process(Pid::from_u32(*child_pid)) else {
            continue;
        };
        subprocesses.push(SubprocessInfo {
            pid: *child_pid,
            parent_pid,
            name: process.name().to_string_lossy().into_owned(),
            command: process
                .cmd()
                .iter()
                .map(|argument| argument.to_string_lossy().into_owned())
                .collect(),
        });
        collect_descendants(*child_pid, system, children, subprocesses);
    }
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;
    use std::process::{Command, Stdio};

    use super::*;

    #[test]
    fn lists_a_child_process() {
        let mut child = child_sleep();
        let child_pid = child.id();

        let subprocesses = list_subprocesses(std::process::id()).unwrap();

        let _ = child.kill();
        let _ = child.wait();
        assert!(subprocesses.iter().any(|process| process.pid == child_pid));
    }

    #[test]
    fn lists_a_tcp_listener_for_the_current_process() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();

        let ports = list_listening_ports(&[std::process::id()]).unwrap();

        assert!(ports.iter().any(|entry| entry.port == port));
    }

    #[cfg(unix)]
    fn child_sleep() -> std::process::Child {
        Command::new("sleep")
            .arg("30")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }

    #[cfg(windows)]
    fn child_sleep() -> std::process::Child {
        Command::new("powershell")
            .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 30"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }
}
