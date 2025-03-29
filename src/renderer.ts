import "./index.css";

console.log(
  '👋 This message is being logged by "renderer.ts", included via Vite'
);

// Typescript interface for the exposed electronAPI
interface ElectronAPI {
  sendToMain: (message: string) => void;
  sendToMainWS: (
    message: string
  ) => { startTime: number; measurementId: string } | false;
  onMainResponse: (callback: (data: any) => void) => () => void;
  onMainMessage: (callback: (data: any) => void) => () => void;
  onWebSocketStatusChanged: (
    callback: (enabled: boolean) => void
  ) => () => void;
  onWebSocketMessage: (callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Elements from the DOM
let resultDisplay: HTMLDivElement;
let rendererButton: HTMLButtonElement;
let rendererWSButton: HTMLButtonElement;
let wsStatusIndicator: HTMLDivElement;
let clearResultsButton: HTMLButtonElement;
// 新しいテスト用UI要素
let testCountInput: HTMLInputElement;
let concurrentExecutionCheckbox: HTMLInputElement;
let testControlsContainer: HTMLDivElement;
let batchTestIPCButton: HTMLButtonElement;
let batchTestWSButton: HTMLButtonElement;
let statisticsDisplay: HTMLDivElement;

// Store all measurement results
const measurementResults: any[] = [];

// WebSocket connection state
let wsConnected = false;
let ws: WebSocket | null = null;
const WS_URL = "ws://127.0.0.1:3000";

// テスト実行の統計情報
interface TestStatistics {
  method: string;
  count: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  totalTime: number;
}

// テスト統計情報を格納する配列
const testStatistics: TestStatistics[] = [];

// テスト実行中かどうかのフラグ
let isTestRunning = false;
// 完了したテストのカウンター
let completedTests = 0;
// 現在実行中のテストの数
let activeTests = 0;

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  createUI();
  setupEventListeners();
  initializeWebSocket();
});

// Initialize WebSocket connection and listeners
function initializeWebSocket() {
  // Listen for WebSocket status changes from the main process
  window.electronAPI.onWebSocketStatusChanged((enabled) => {
    wsConnected = enabled;
    updateWSStatus(enabled);

    // Connect or disconnect based on status
    if (enabled && !ws) {
      connectWebSocket();
    } else if (!enabled && ws) {
      disconnectWebSocket();
    }

    // WebSocketが無効またはWS接続がオープンでない場合はボタンを無効化
    const wsDisabled = !enabled || !ws || ws.readyState !== WebSocket.OPEN;
    rendererWSButton.disabled = wsDisabled;
    // BatchTestボタンも同様に設定
    batchTestWSButton.disabled = wsDisabled;
  });

  // Try to connect immediately
  connectWebSocket();
}

// Connect to WebSocket server
function connectWebSocket() {
  if (ws) {
    disconnectWebSocket();
  }

  try {
    console.log(`Connecting to WebSocket server at ${WS_URL}...`);
    ws = new WebSocket(WS_URL);

    ws.addEventListener("open", () => {
      console.log("Connected to WebSocket server");
      wsConnected = true;
      updateWSStatus(true);
      rendererWSButton.disabled = false;
      // バッチテストWebSocketボタンも有効化
      batchTestWSButton.disabled = false;
    });

    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const endTime = performance.now();

        // 対応するリクエストのstartTimeを探す
        const tracking = measurementResults.find(
          (item) =>
            item.type === "ws-tracking" &&
            item.measurementId === data.measurementId
        );

        const startTime = tracking
          ? tracking.startTime
          : data.rendererStartTime;
        // ラウンドトリップ時間を計算
        const totalRoundTrip = startTime ? endTime - startTime : 0;

        // Add to results directly from renderer WebSocket
        addResult({
          type: "renderer-initiated-response",
          method: "WebSocket",
          responseData: data,
          totalRoundTrip,
          measurementId: data.measurementId,
          message: "Received response from main process via WebSocket",
        });
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.addEventListener("close", () => {
      console.log("Disconnected from WebSocket server");
      wsConnected = false;
      updateWSStatus(false);
      rendererWSButton.disabled = true;
      batchTestWSButton.disabled = true;
      ws = null;
    });

    ws.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      wsConnected = false;
      updateWSStatus(false);
      rendererWSButton.disabled = true;
      batchTestWSButton.disabled = true;
      ws = null;
    });
  } catch (error) {
    console.error("Failed to connect to WebSocket server:", error);
    wsConnected = false;
    updateWSStatus(false);
    rendererWSButton.disabled = true;
    ws = null;
  }
}

// Disconnect from WebSocket server
function disconnectWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
  wsConnected = false;
  updateWSStatus(false);
  rendererWSButton.disabled = true;
  batchTestWSButton.disabled = true; // バッチテストボタンも無効化
}

// Create the UI elements
function createUI() {
  // Create main container
  const container = document.createElement("div");
  container.className = "container";
  document.body.appendChild(container);

  // Create title
  const title = document.createElement("h1");
  title.textContent = "Electron IPC/WebSocket Performance Test";
  container.appendChild(title);

  // Create button container
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "button-container";
  container.appendChild(buttonContainer);

  // Create renderer-to-main button for IPC
  rendererButton = document.createElement("button");
  rendererButton.textContent = "Test Renderer → Main → Renderer (IPC)";
  rendererButton.className = "btn primary";
  buttonContainer.appendChild(rendererButton);

  // Create renderer-to-main button for WebSocket
  rendererWSButton = document.createElement("button");
  rendererWSButton.textContent = "Test Renderer → Main → Renderer (WebSocket)";
  rendererWSButton.className = "btn primary ws-btn";
  rendererWSButton.disabled = true;
  buttonContainer.appendChild(rendererWSButton);

  // Create WebSocket status indicator
  wsStatusIndicator = document.createElement("div");
  wsStatusIndicator.className = "ws-status";
  wsStatusIndicator.innerHTML = `
    <span class="status-label">WebSocket: </span>
    <span class="status-indicator disabled">Disabled</span>
  `;
  buttonContainer.appendChild(wsStatusIndicator);

  // Create clear results button
  clearResultsButton = document.createElement("button");
  clearResultsButton.textContent = "Clear Results";
  clearResultsButton.className = "btn secondary";
  buttonContainer.appendChild(clearResultsButton);

  // Create results container
  const resultsContainer = document.createElement("div");
  resultsContainer.className = "results-container";
  container.appendChild(resultsContainer);

  // Create results title
  const resultsTitle = document.createElement("h2");
  resultsTitle.textContent = "Performance Results";
  resultsContainer.appendChild(resultsTitle);

  // Create results display
  resultDisplay = document.createElement("div");
  resultDisplay.className = "result-display";
  resultsContainer.appendChild(resultDisplay);

  // 新しいテスト用UI要素を作成
  testControlsContainer = document.createElement("div");
  testControlsContainer.className = "test-controls";
  container.appendChild(testControlsContainer);

  // テスト実行回数の入力フィールド
  testCountInput = document.createElement("input");
  testCountInput.type = "number";
  testCountInput.value = "1";
  testCountInput.min = "1";
  testCountInput.className = "test-count-input";
  testControlsContainer.appendChild(testCountInput);

  // 並行実行のチェックボックス
  concurrentExecutionCheckbox = document.createElement("input");
  concurrentExecutionCheckbox.type = "checkbox";
  testControlsContainer.appendChild(concurrentExecutionCheckbox);

  // 並行実行のラベル
  const concurrentExecutionLabel = document.createElement("label");
  concurrentExecutionLabel.textContent = "Concurrent Execution";
  testControlsContainer.appendChild(concurrentExecutionLabel);

  // IPCバッチテストボタン
  batchTestIPCButton = document.createElement("button");
  batchTestIPCButton.textContent = "Batch Test (IPC)";
  batchTestIPCButton.className = "btn primary";
  testControlsContainer.appendChild(batchTestIPCButton);

  // WebSocketバッチテストボタン
  batchTestWSButton = document.createElement("button");
  batchTestWSButton.textContent = "Batch Test (WebSocket)";
  batchTestWSButton.className = "btn primary ws-btn";
  batchTestWSButton.disabled = true;
  testControlsContainer.appendChild(batchTestWSButton);

  // 統計情報表示エリア
  statisticsDisplay = document.createElement("div");
  statisticsDisplay.className = "statistics-display";
  resultsContainer.appendChild(statisticsDisplay);
}

// Set up event listeners
function setupEventListeners() {
  // Listen for renderer-to-main button click (IPC)
  rendererButton.addEventListener("click", () => {
    const startTime = performance.now();
    window.electronAPI.sendToMain("Test message from renderer");
    addResult({
      type: "renderer-initiated",
      method: "IPC",
      startTime,
      message: "Sent message from renderer to main process via IPC",
    });
  });

  // Listen for renderer-to-main button click (WebSocket)
  rendererWSButton.addEventListener("click", () => {
    // 直接WebSocket経由で送信する実装に変更
    if (ws && ws.readyState === WebSocket.OPEN) {
      const startTime = performance.now();
      const measurementId = `ws-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      ws.send(
        JSON.stringify({
          message: "Test message from renderer via WebSocket (direct)",
          startTime,
          measurementId,
        })
      );

      addResult({
        type: "renderer-initiated",
        method: "WebSocket",
        startTime: startTime,
        measurementId: measurementId,
        message:
          "Sent message from renderer to main process via WebSocket (direct)",
      });

      // WebSocketの送信と受信の関連付けのためにmeasurementResultsにstartTimeを保存
      measurementResults.push({
        type: "ws-tracking",
        measurementId: measurementId,
        startTime: startTime,
        timestamp: new Date().toISOString(),
      });
    } else {
      addResult({
        type: "error",
        message:
          "Failed to send message via WebSocket. Make sure WebSocket is enabled and connected.",
      });
    }
  });

  // Listen for main-to-renderer response via IPC
  window.electronAPI.onMainResponse((data) => {
    const endTime = performance.now();
    // ラウンドトリップ時間を計算
    const totalRoundTrip = endTime - data.rendererStartTime;

    addResult({
      type: "renderer-initiated-response",
      method: "IPC",
      responseData: data,
      endTime,
      totalRoundTrip,
      measurementId: data.measurementId,
      message: "Received response from main process via IPC",
    });
  });

  // Listen for WebSocket messages
  window.electronAPI.onWebSocketMessage((data) => {
    addResult({
      type: "renderer-initiated-response",
      method: "WebSocket",
      responseData: data,
      endTime: data.endTime,
      measurementId: data.measurementId,
      message: "Received response from main process via WebSocket",
    });
  });

  // Listen for main process initiated messages
  window.electronAPI.onMainMessage((data) => {
    const receivedTime = performance.now();
    addResult({
      type: "main-initiated",
      method: "IPC",
      receivedTime,
      data,
      measurementId: data.measurementId,
      message: "Received message from main process via IPC",
    });
  });

  // Clear results button
  clearResultsButton.addEventListener("click", () => {
    measurementResults.length = 0;
    renderResults();
  });

  // Batch Test (IPC) button
  batchTestIPCButton.addEventListener("click", () => {
    if (isTestRunning) {
      return;
    }

    const testCount = parseInt(testCountInput.value) || 1;
    const concurrentExecution = concurrentExecutionCheckbox.checked;

    startBatchTestIPC(testCount, concurrentExecution);
  });

  // Batch Test (WebSocket) button
  batchTestWSButton.addEventListener("click", () => {
    if (isTestRunning) {
      return;
    }

    const testCount = parseInt(testCountInput.value) || 1;
    const concurrentExecution = concurrentExecutionCheckbox.checked;

    startBatchTestWS(testCount, concurrentExecution);
  });
}

// Update WebSocket status indicator
function updateWSStatus(enabled: boolean) {
  const statusText = wsStatusIndicator.querySelector(".status-indicator");
  if (statusText) {
    statusText.textContent = enabled ? "Enabled" : "Disabled";
    statusText.className = `status-indicator ${
      enabled ? "enabled" : "disabled"
    }`;
  }
}

// Add a result to the measurement results array
function addResult(result: any) {
  measurementResults.push({
    ...result,
    timestamp: new Date().toISOString(),
  });
  renderResults();
}

// Render the results in the result display
function renderResults() {
  resultDisplay.innerHTML = "";

  if (measurementResults.length === 0) {
    resultDisplay.innerHTML =
      '<p class="no-results">No measurements yet. Use the buttons above to start testing.</p>';
    return;
  }

  // Create result items in reverse order (newest first)
  [...measurementResults].reverse().forEach((result, index) => {
    // ws-trackingタイプの結果は表示しない（内部トラッキング用）
    if (result.type === "ws-tracking") return;

    const resultItem = document.createElement("div");
    resultItem.className = `result-item ${result.type}`;

    if (result.method) {
      resultItem.classList.add(`method-${result.method.toLowerCase()}`);
    }

    let resultContent = "";
    let timeInfo = "";

    switch (result.type) {
      case "renderer-initiated":
        timeInfo = `Start Time: ${result.startTime.toFixed(3)}ms`;
        break;
      case "renderer-initiated-response":
        // totalRoundTripを表示
        timeInfo = `
          <div class="time-details">
            <div><strong>Total Round Trip: ${
              result.totalRoundTrip ? result.totalRoundTrip.toFixed(3) : "N/A"
            }ms</strong></div>
            ${
              result.measurementId
                ? `<div class="measurement-id">ID: ${result.measurementId}</div>`
                : ""
            }
          </div>
        `;
        break;
      case "main-initiated":
        timeInfo = `Received at: ${result.receivedTime.toFixed(3)}ms`;
        if (result.measurementId) {
          timeInfo += `<div class="measurement-id">ID: ${result.measurementId}</div>`;
        }
        break;
      case "error":
        timeInfo = "An error occurred";
        break;
    }

    resultContent = `
      <div class="result-header">
        <span class="result-index">#${measurementResults.length - index}</span>
        <span class="result-type">${formatResultType(result.type)}</span>
        ${
          result.method
            ? `<span class="result-method">${result.method}</span>`
            : ""
        }
        <span class="result-timestamp">${formatTimestamp(
          result.timestamp
        )}</span>
      </div>
      <div class="result-message">${result.message}</div>
      <div class="result-timing">${timeInfo}</div>
    `;

    resultItem.innerHTML = resultContent;
    resultDisplay.appendChild(resultItem);
  });
}

// Format the result type for display
function formatResultType(type: string): string {
  switch (type) {
    case "renderer-initiated":
      return "Renderer → Main";
    case "renderer-initiated-response":
      return "Main → Renderer (Response)";
    case "main-initiated":
      return "Main → Renderer";
    case "error":
      return "Error";
    default:
      return type;
  }
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Convert hrtime to milliseconds
function hrTimeToMs(hrTime: [number, number]): number {
  return hrTime[0] * 1000 + hrTime[1] / 1000000;
}

// Start batch test using IPC
function startBatchTestIPC(count: number, concurrent: boolean) {
  if (isTestRunning) return;

  isTestRunning = true;
  completedTests = 0;
  activeTests = 0;

  // バッチテストの開始を表示
  addResult({
    type: "info",
    method: "IPC",
    message: `Starting batch test: ${count} iterations, ${
      concurrent ? "concurrent" : "sequential"
    }`,
    timestamp: new Date().toISOString(),
  });

  // レスポンスを監視するハンドラー
  const ipcResponseHandler = (data: any) => {
    const endTime = performance.now();
    const totalRoundTrip = endTime - data.rendererStartTime;

    // テスト結果を記録
    trackTestResult("IPC", totalRoundTrip);

    completedTests++;
    activeTests--;

    // 全てのテストが完了したかチェック
    if (completedTests >= count && activeTests === 0) {
      finishBatchTest("IPC", count);
      // イベントリスナーを削除
      window.electronAPI.onMainResponse(ipcResponseHandler);
    } else if (!concurrent && activeTests === 0 && completedTests < count) {
      // シーケンシャルモードで次のテストを実行
      runNextIPCTest();
    }
  };

  // バッチテスト用のレスポンスハンドラを設定
  window.electronAPI.onMainResponse(ipcResponseHandler);

  if (concurrent) {
    // 並行実行モード: すべてのテストを一度に開始
    for (let i = 0; i < count; i++) {
      sendIPCRequest();
    }
  } else {
    // シーケンシャルモード: 最初のテストを開始
    runNextIPCTest();
  }
}

// 次のIPCテストを実行
function runNextIPCTest() {
  if (activeTests === 0) {
    sendIPCRequest();
  }
}

// IPC経由でリクエストを送信
function sendIPCRequest() {
  const startTime = performance.now();
  window.electronAPI.sendToMain(
    `Test message from renderer #${completedTests + activeTests + 1}`
  );
  activeTests++;
}

// Start batch test using WebSocket
function startBatchTestWS(count: number, concurrent: boolean) {
  if (isTestRunning || !ws || ws.readyState !== WebSocket.OPEN) return;

  isTestRunning = true;
  completedTests = 0;
  activeTests = 0;

  // Clear existing ws tracking entries before starting new batch test
  const existingTrackingIndices = [];
  for (let i = 0; i < measurementResults.length; i++) {
    if (measurementResults[i].type === "ws-tracking") {
      existingTrackingIndices.push(i);
    }
  }

  // Remove from end to avoid index shifting
  for (let i = existingTrackingIndices.length - 1; i >= 0; i--) {
    measurementResults.splice(existingTrackingIndices[i], 1);
  }

  // バッチテストの開始を表示
  addResult({
    type: "info",
    method: "WebSocket",
    message: `Starting batch test: ${count} iterations, ${
      concurrent ? "concurrent" : "sequential"
    }`,
    timestamp: new Date().toISOString(),
  });

  // WebSocketのレスポンスハンドラー
  const wsMessageCallback = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const endTime = performance.now();

      // 対応するリクエストのstartTimeを探す
      const tracking = measurementResults.find(
        (item) =>
          item.type === "ws-tracking" &&
          item.measurementId === data.measurementId
      );

      const startTime = tracking ? tracking.startTime : data.rendererStartTime;
      const totalRoundTrip = startTime ? endTime - startTime : 0;

      // テスト結果を記録
      trackTestResult("WebSocket", totalRoundTrip);

      completedTests++;
      activeTests--;

      // 全てのテストが完了したかチェック
      if (completedTests >= count && activeTests === 0) {
        finishBatchTest("WebSocket", count);
        // イベントリスナーを削除
        ws?.removeEventListener("message", wsMessageCallback);
      } else if (!concurrent && activeTests === 0 && completedTests < count) {
        // シーケンシャルモードで次のテストを実行
        runNextWSTest();
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  };

  // WebSocketのレスポンスハンドラーを設定
  ws.addEventListener("message", wsMessageCallback);

  if (concurrent) {
    // 並行実行モード: すべてのテストを一度に開始
    for (let i = 0; i < count; i++) {
      sendWSRequest();
    }
  } else {
    // シーケンシャルモード: 最初のテストを開始
    runNextWSTest();
  }
}

// 次のWebSocketテストを実行
function runNextWSTest() {
  if (activeTests === 0) {
    sendWSRequest();
  }
}

// WebSocket経由でリクエストを送信
function sendWSRequest() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const startTime = performance.now();
  const measurementId = `ws-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;

  ws.send(
    JSON.stringify({
      message: `Test message from renderer via WebSocket #${
        completedTests + activeTests + 1
      }`,
      startTime,
      measurementId,
    })
  );

  // WebSocketの送信と受信の関連付けのためにmeasurementResultsにstartTimeを保存
  measurementResults.push({
    type: "ws-tracking",
    measurementId: measurementId,
    startTime: startTime,
    timestamp: new Date().toISOString(),
  });

  activeTests++;
}

// テスト結果を記録
function trackTestResult(method: string, roundTripTime: number) {
  // 既存の統計情報を探す
  let stats = testStatistics.find((s) => s.method === method);

  if (!stats) {
    // 新しい統計情報を作成
    stats = {
      method,
      count: 0,
      avgTime: 0,
      minTime: Number.MAX_VALUE,
      maxTime: 0,
      totalTime: 0,
    };
    testStatistics.push(stats);
  }

  // 統計情報を更新
  stats.count++;
  stats.totalTime += roundTripTime;
  stats.avgTime = stats.totalTime / stats.count;
  stats.minTime = Math.min(stats.minTime, roundTripTime);
  stats.maxTime = Math.max(stats.maxTime, roundTripTime);
}

// バッチテスト完了処理
function finishBatchTest(method: string, count: number) {
  isTestRunning = false;

  // 統計情報を表示
  renderStatistics();

  // バッチテスト完了メッセージを表示
  addResult({
    type: "info",
    method: method,
    message: `Batch test completed: ${count} iterations`,
    timestamp: new Date().toISOString(),
  });
}

// 統計情報の表示
function renderStatistics() {
  statisticsDisplay.innerHTML = "";

  if (testStatistics.length === 0) {
    statisticsDisplay.innerHTML = "<p>No statistics available</p>";
    return;
  }

  // 統計情報のテーブルを作成
  const table = document.createElement("table");
  table.className = "statistics-table";

  // テーブルヘッダー
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Method</th>
      <th>Count</th>
      <th>Avg Time (ms)</th>
      <th>Min Time (ms)</th>
      <th>Max Time (ms)</th>
      <th>Total Time (ms)</th>
    </tr>
  `;
  table.appendChild(thead);

  // テーブルボディ
  const tbody = document.createElement("tbody");
  testStatistics.forEach((stats) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${stats.method}</td>
      <td>${stats.count}</td>
      <td>${stats.avgTime.toFixed(3)}</td>
      <td>${stats.minTime.toFixed(3)}</td>
      <td>${stats.maxTime.toFixed(3)}</td>
      <td>${stats.totalTime.toFixed(3)}</td>
    `;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  // 統計情報タイトル
  const title = document.createElement("h3");
  title.textContent = "Test Statistics";
  statisticsDisplay.appendChild(title);
  statisticsDisplay.appendChild(table);
}
