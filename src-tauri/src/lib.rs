// ===================================================================
// Stupid Simple — Tauri backend
// The only Rust logic: the OAuth loopback listener on 127.0.0.1
// (pure std, zero extra crates). Everything else lives in TypeScript.
// ===================================================================
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use tauri::State;

struct OauthState(Mutex<Option<TcpListener>>);

/// Binds a listener on a random free port on 127.0.0.1 and returns the port.
#[tauri::command]
fn oauth_start(state: State<'_, OauthState>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    *state.0.lock().unwrap() = Some(listener);
    Ok(port)
}

#[derive(serde::Serialize)]
struct OauthResult {
    code: String,
    state: String,
}

/// Waits (on a blocking thread) for Google's redirect, parses
/// ?code=...&state=..., responds with a friendly page and returns the data.
#[tauri::command]
async fn oauth_wait(state: State<'_, OauthState>) -> Result<OauthResult, String> {
    let listener = state
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("Call oauth_start first")?;

    tauri::async_runtime::spawn_blocking(move || -> Result<OauthResult, String> {
        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
        let req = String::from_utf8_lossy(&buf[..n]);

        // First line: GET /?code=...&state=... HTTP/1.1
        let first = req.lines().next().unwrap_or("");
        let path = first.split_whitespace().nth(1).unwrap_or("");
        let query = path.split('?').nth(1).unwrap_or("");

        let mut code = String::new();
        let mut st = String::new();
        for pair in query.split('&') {
            let mut it = pair.splitn(2, '=');
            match (it.next(), it.next()) {
                (Some("code"), Some(v)) => code = urldecode(v),
                (Some("state"), Some(v)) => st = urldecode(v),
                _ => {}
            }
        }

        let body = if code.is_empty() {
            "<h1 style=\"font-family:sans-serif\">Hmm, no code received. Go back to Stupid Simple and try again.</h1>"
        } else {
            "<div style=\"font-family:sans-serif;text-align:center;margin-top:18vh\">\
             <div style=\"font-size:64px\">🍬</div>\
             <h1>Signed in!</h1><p>You can close this tab and go back to Stupid Simple.</p></div>"
        };
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();

        if code.is_empty() {
            Err("Google did not return an authorization code".into())
        } else {
            Ok(OauthResult { code, state: st })
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Minimal percent-encoding decoder (sufficient for code/state).
fn urldecode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(OauthState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![oauth_start, oauth_wait])
        .run(tauri::generate_context!())
        .expect("error while running Stupid Simple");
}
