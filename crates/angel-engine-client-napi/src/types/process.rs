use napi_derive::napi;

#[napi(object)]
pub struct SubprocessInfo {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub command: Vec<String>,
}

#[napi(object)]
pub struct ListeningPortInfo {
    pub pid: u32,
    pub port: u16,
    pub address: String,
}
