// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

// WebSocket connection variables
let ws: WebSocket | null = null;
const WS_URL = "ws://127.0.0.1:3000";
let wsEnabled = false;

// Expose protected methods that allow the renderer process to use IPC
contextBridge.exposeInMainWorld("electronAPI", {
  // Send message from renderer to main process via IPC
  sendToMain: (message: string) => {
    const startTime = performance.now();
    return ipcRenderer.send("renderer-to-main", {
      message,
      startTime,
    });
  },

  // Send message from renderer to main process via WebSocket
  sendToMainWS: (message: string) => {
    if (!wsEnabled || !ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Use performance.now() for renderer-side timing
    const startTime = performance.now();

    // Generate a measurement ID for WebSocket communication
    const measurementId = `ws-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    ws.send(
      JSON.stringify({
        message,
        startTime,
        measurementId,
      })
    );

    return {
      startTime,
      measurementId,
    };
  },

  // Receive response from main process via IPC
  onMainResponse: (callback: (data: any) => void) => {
    ipcRenderer.on("main-to-renderer", (_, data) => callback(data));

    // Return a function to remove the listener when no longer needed
    return () => {
      ipcRenderer.removeAllListeners("main-to-renderer");
    };
  },

  // Receive message initiated by main process
  onMainMessage: (callback: (data: any) => void) => {
    ipcRenderer.on("main-process-message", (_, data) => {
      const receivedTime = performance.now();

      // Notify main process that renderer received the message (for timing measurement)
      ipcRenderer.send("main-message-received", {
        measurementId: data.measurementId,
        receivedAt: receivedTime,
      });

      // Pass data to the renderer
      callback({
        ...data,
        receivedAt: receivedTime,
      });

      // Process the data (simulate work)
      const processingStartTime = performance.now();
      // Simulate some processing delay (could be actual processing in a real app)
      const processingDelay = 5; // milliseconds
      while (performance.now() - processingStartTime < processingDelay) {
        // Busy wait to simulate work
      }

      // Send response back to main process
      const responseTime = performance.now() - receivedTime;
      ipcRenderer.send("main-message-response", {
        measurementId: data.measurementId,
        responseTime: responseTime,
        startTime: data.startTime,
      });
    });

    return () => {
      ipcRenderer.removeAllListeners("main-process-message");
    };
  },

  // Listen for WebSocket status changes
  onWebSocketStatusChanged: (callback: (enabled: boolean) => void) => {
    ipcRenderer.on("websocket-status-changed", (_, enabled) => {
      wsEnabled = enabled;

      // Connect or disconnect WebSocket based on status
      if (enabled) {
        connectWebSocket();
      } else {
        disconnectWebSocket();
      }

      callback(enabled);
    });

    return () => {
      ipcRenderer.removeAllListeners("websocket-status-changed");
    };
  },

  // Register WebSocket message handler
  onWebSocketMessage: (callback: (data: any) => void) => {
    window.addEventListener("ws-message", ((event: CustomEvent) => {
      callback(event.detail);
    }) as EventListener);
  },
});

// Connect to WebSocket server
function connectWebSocket() {
  if (ws) {
    disconnectWebSocket();
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.addEventListener("open", () => {
      console.log("Connected to WebSocket server");
    });

    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const endTime = performance.now();

        // Dispatch custom event with received data
        window.dispatchEvent(
          new CustomEvent("ws-message", {
            detail: {
              ...data,
              endTime,
            },
          })
        );
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.addEventListener("close", () => {
      console.log("Disconnected from WebSocket server");
      ws = null;
    });

    ws.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      ws = null;
    });
  } catch (error) {
    console.error("Failed to connect to WebSocket server:", error);
    ws = null;
  }
}

// Disconnect from WebSocket server
function disconnectWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}
