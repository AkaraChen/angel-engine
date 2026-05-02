use std::io::{self, BufRead, BufReader, Write};
use std::sync::mpsc;
use std::thread;

use angel_engine::{TransportLog, TransportLogKind};

pub(super) enum AppLine {
    Stdout(String),
    Stderr(String),
}

pub(super) fn spawn_line_reader<R, F>(reader: R, tx: mpsc::Sender<AppLine>, wrap: F)
where
    R: io::Read + Send + 'static,
    F: Fn(String) -> AppLine + Send + 'static + Copy,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if tx.send(wrap(line)).is_err() {
                break;
            }
        }
    });
}

pub(super) fn print_log(log: &TransportLog) -> io::Result<()> {
    match log.kind {
        TransportLogKind::Output => {
            print!("{}", log.message);
            io::stdout().flush()
        }
        TransportLogKind::Send => {
            println!("[send] {}", log.message);
            Ok(())
        }
        TransportLogKind::Receive => {
            println!("[recv] {}", log.message);
            Ok(())
        }
        TransportLogKind::State => {
            println!("[state] {}", log.message);
            Ok(())
        }
        TransportLogKind::Warning => {
            println!("[warn] {}", log.message);
            Ok(())
        }
        TransportLogKind::Error => {
            println!("[error] {}", log.message);
            Ok(())
        }
    }
}
