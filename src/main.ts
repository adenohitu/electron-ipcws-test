import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { WebSocketServer } from "ws";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Global flag to control WebSocket server
let wsServerEnabled = false;
let wss: WebSocketServer | null = null;
const WS_PORT = 3000;

// WebSocketクライアント接続をトラッキングするための配列
const wsClients: any[] = [];

// Object to store measurement data
const measurements = {
  mainInitiated: new Map<
    string,
    {
      startTime: [number, number];
      mainToRendererTime: number;
      totalRoundTrip: number; // 追加: 全体的なラウンドトリップ時間
    }
  >(),
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Create menu with items to trigger main process events
  const menu = Menu.buildFromTemplate([
    {
      label: "App",
      submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Test",
      submenu: [
        {
          label: "Trigger Main Process Event",
          click: () => {
            // Generate a unique ID for this measurement
            const measurementId = `main-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`;

            // Start timing
            const startTime = process.hrtime();

            // Store measurement info
            measurements.mainInitiated.set(measurementId, {
              startTime,
              mainToRendererTime: 0,
              totalRoundTrip: 0,
            });

            // Send message to renderer
            mainWindow.webContents.send("main-process-message", {
              message: "Message from main process",
              measurementId,
              startTime,
            });
          },
        },
        {
          label: "Toggle WebSocket",
          click: () => {
            toggleWebSocketServer(mainWindow);
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  return mainWindow;
};

// Toggle the WebSocket server on/off
function toggleWebSocketServer(mainWindow: BrowserWindow) {
  if (wsServerEnabled) {
    // Shut down the server
    if (wss) {
      wss.close();
      wss = null;
      console.log("WebSocket server stopped");
    }
    wsServerEnabled = false;
  } else {
    // Start the server
    wsServerEnabled = true;
    setupWebSocketServer(mainWindow);
  }

  // Notify the renderer process of the WebSocket status change
  mainWindow.webContents.send("websocket-status-changed", wsServerEnabled);
}

// Set up WebSocket server
function setupWebSocketServer(mainWindow: BrowserWindow) {
  if (!wsServerEnabled || wss) return;

  console.log(`Starting WebSocket server on port ${WS_PORT}`);

  wss = new WebSocketServer({ port: WS_PORT, host: "127.0.0.1" });

  wss.on("connection", (ws) => {
    console.log("Client connected to WebSocket server");

    wsClients.push(ws);

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        const receivedTime = process.hrtime();
        const mainReceivedTimestamp = process.hrtime.bigint();

        // Generate a measurement ID for WebSocket communication
        const measurementId = `ws-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        // Process data (simulating some work)
        const processStartTime = process.hrtime();

        const processedData = {
          measurementId,
          originalMessage: data.message,
          rendererStartTime: data.startTime, // レンダラーでの開始時間を保存
          totalRoundTrip: 0, // レンダラー側で計算される
        };

        // Send response back to renderer
        ws.send(JSON.stringify(processedData));
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected from WebSocket server");
      wsClients.splice(wsClients.indexOf(ws), 1);
    });
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
    wss = null;
    wsServerEnabled = false;
    mainWindow.webContents.send("websocket-status-changed", wsServerEnabled);
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  const mainWindow = createWindow();

  // Set up IPC listeners
  setupIPC(mainWindow);
});

// Set up IPC communication
function setupIPC(mainWindow: BrowserWindow) {
  // Handle renderer to main process communication and echo back
  ipcMain.on("renderer-to-main", (event, data) => {
    // Generate a measurement ID for this communication
    const measurementId = `renderer-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    // data.startTime now contains performance.now() timestamp from renderer
    const receivedTime = process.hrtime();
    const mainReceivedTimestamp = process.hrtime.bigint(); // For calculating time difference

    // Process data (simulating some work)
    const processStartTime = process.hrtime();

    // Calculate time difference based on when we received it
    // This is just an approximation since we're using different time sources
    const rendererToMainTime =
      Number(process.hrtime.bigint() - mainReceivedTimestamp) / 1000000;

    const processedData = {
      measurementId,
      originalMessage: data.message,
      rendererStartTime: data.startTime, // レンダラーでの開始時間を保存
      totalRoundTrip: 0, // レンダラー側で計算される
    };

    // Send response back to renderer
    event.sender.send("main-to-renderer", processedData);
  });

  // Handle response to main-initiated message
  ipcMain.on("main-message-response", (event, data) => {
    const measurementId = data.measurementId;

    // Check if we have a measurement for this ID
    if (measurementId && measurements.mainInitiated.has(measurementId)) {
      const measurement = measurements.mainInitiated.get(measurementId)!;
      const totalTime = process.hrtime(measurement.startTime);

      // Calculate and store the pure IPC round-trip time
      console.log(`[${measurementId}] Pure IPC round trip time:`, {
        totalTimeMs: totalTime[0] * 1000.0 + totalTime[1] / 1000000.0,
        mainToRendererTime: measurement.mainToRendererTime,
        rendererProcessingTime: data.responseTime,
        rendererToMainTime:
          totalTime[0] * 1000.0 +
          totalTime[1] / 1000000.0 -
          data.responseTime -
          measurement.mainToRendererTime,
      });

      // Remove the measurement to free memory
      measurements.mainInitiated.delete(measurementId);
    } else {
      console.log(
        "Response received from renderer process for unknown measurement:",
        data
      );
    }
  });

  // Track when the renderer receives the message (main to renderer time)
  ipcMain.on("main-message-received", (event, data) => {
    const measurementId = data.measurementId;

    // Check if we have a measurement for this ID
    if (measurementId && measurements.mainInitiated.has(measurementId)) {
      const measurement = measurements.mainInitiated.get(measurementId)!;
      const mainToRendererTime = process.hrtime(measurement.startTime);

      // Store the main to renderer time
      measurement.mainToRendererTime =
        mainToRendererTime[0] * 1000.0 + mainToRendererTime[1] / 1000000.0;
      measurements.mainInitiated.set(measurementId, measurement);

      console.log(
        `[${measurementId}] Main to renderer time: ${measurement.mainToRendererTime}ms`
      );
    }
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
