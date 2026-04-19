use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

/// Holds the write-half of the active WebSocket connection (if any).
struct WsState {
    writer: Option<
        futures_util::stream::SplitSink<
            tokio_tungstenite::WebSocketStream<
                tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
            >,
            Message,
        >,
    >,
}

#[tauri::command]
fn get_server_config(app: AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("config.json").map_err(|e| e.to_string())?;

    let api_base_url = store
        .get("api_base_url")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default();

    let socket_url = store
        .get("socket_url")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default();

    Ok(serde_json::json!({
        "API_BASE_URL": api_base_url,
        "SOCKET_URL": socket_url,
    }))
}

#[tauri::command]
fn save_server_config(
    app: AppHandle,
    api_base_url: String,
    socket_url: String,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("config.json").map_err(|e| e.to_string())?;
    store.set("api_base_url", serde_json::json!(api_base_url));
    store.set("socket_url", serde_json::json!(socket_url));
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Connect to a WebSocket server. Messages received from the server are
/// forwarded to the frontend via Tauri events (`ws-message`).
#[tauri::command]
async fn ws_connect(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<WsState>>>,
    url: String,
) -> Result<(), String> {
    // Disconnect any existing connection first.
    {
        let mut st = state.lock().await;
        if let Some(mut writer) = st.writer.take() {
            let _ = writer.close().await;
        }
    }

    let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|e| format!("WebSocket connect failed: {e}"))?;

    let (writer, mut reader) = ws_stream.split();

    // Store the writer so we can send messages later.
    {
        let mut st = state.lock().await;
        st.writer = Some(writer);
    }

    // Emit "ws-connected" to frontend.
    let _ = app.emit("ws-connected", ());

    // Spawn a task to forward incoming messages to the frontend.
    let app_clone = app.clone();
    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        while let Some(msg) = reader.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    let _ = app_clone.emit("ws-message", text.to_string());
                }
                Ok(Message::Close(_)) => {
                    break;
                }
                Err(e) => {
                    eprintln!("WebSocket read error: {e}");
                    break;
                }
                _ => {} // ignore binary/ping/pong
            }
        }

        // Clean up writer on disconnect.
        {
            let mut st = state_clone.lock().await;
            st.writer = None;
        }
        let _ = app_clone.emit("ws-disconnected", ());
    });

    Ok(())
}

/// Send a text message over the active WebSocket connection.
#[tauri::command]
async fn ws_send(
    state: tauri::State<'_, Arc<Mutex<WsState>>>,
    message: String,
) -> Result<(), String> {
    let mut st = state.lock().await;
    if let Some(ref mut writer) = st.writer {
        writer
            .send(Message::Text(message.into()))
            .await
            .map_err(|e| format!("WebSocket send failed: {e}"))?;
        Ok(())
    } else {
        Err("WebSocket not connected".into())
    }
}

/// Disconnect the active WebSocket connection.
#[tauri::command]
async fn ws_disconnect(state: tauri::State<'_, Arc<Mutex<WsState>>>) -> Result<(), String> {
    let mut st = state.lock().await;
    if let Some(mut writer) = st.writer.take() {
        let _ = writer.close().await;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ws_state = Arc::new(Mutex::new(WsState { writer: None }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ws_state)
        .invoke_handler(tauri::generate_handler![
            get_server_config,
            save_server_config,
            ws_connect,
            ws_send,
            ws_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
