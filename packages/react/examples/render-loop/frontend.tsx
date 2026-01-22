import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { state, array } from "@montra-interactive/deepstate";
import { useSelect } from "@montra-interactive/deepstate-react";
import { BehaviorSubject } from "rxjs";

// Create a store similar to TTS player
const ttsPlayerStore = state({
  isPlaying: false,
  isPaused: true,
  isLoading: false,
  isScrubbing: false,
  isInitializing: false,
  globalTimeMs: 0,
  totalDurationMs: 30000, // 30 seconds
  scenes: array(
    [
      { sceneId: "scene-1", ttsJobId: "job-1", durationMs: 10000 },
      { sceneId: "scene-2", ttsJobId: "job-2", durationMs: 10000 },
      { sceneId: "scene-3", ttsJobId: "job-3", durationMs: 10000 },
    ],
    { distinct: "deep" }
  ),
  triggerMode: "CHAINED" as const,
  wasPlayingBeforeScrub: false,
  scrubTargetSceneIndex: null as number | null,
  error: null as { message: string } | null,
  selectedSceneId: "scene-1" as string | null,
});

// Simulate XState machine pattern - a separate observable that syncs to the store
// This mimics: machineActor.subscribe((snapshot) => syncToRedux(snapshot))
class FakeMachine {
  private state$ = new BehaviorSubject({
    isPlaying: false,
    globalTimeMs: 0,
    currentSceneIndex: 0,
  });
  
  private syncCount = 0;
  
  subscribe(callback: (state: any) => void) {
    return this.state$.subscribe(callback);
  }
  
  // Simulates TIME_UPDATE event from audio element
  updateTime(timeMs: number) {
    this.state$.next({
      ...this.state$.getValue(),
      globalTimeMs: timeMs,
    });
  }
  
  play() {
    this.state$.next({
      ...this.state$.getValue(),
      isPlaying: true,
    });
  }
  
  pause() {
    this.state$.next({
      ...this.state$.getValue(),
      isPlaying: false,
    });
  }
  
  getSyncCount() {
    return this.syncCount;
  }
  
  incrementSyncCount() {
    this.syncCount++;
  }
}

const fakeMachine = new FakeMachine();

// This mimics TtsPlayerService.syncToRedux - called on EVERY machine state change
function syncToStore(machineState: any) {
  fakeMachine.incrementSyncCount();
  
  // This is what production does - update ALL fields on every state change
  ttsPlayerStore.update((s) => {
    s.isPlaying.set(machineState.isPlaying);
    s.globalTimeMs.set(machineState.globalTimeMs);
    // In production, 12+ fields are updated here
  });
}

// Setup the subscription (like TtsPlayerService.initialize does)
fakeMachine.subscribe(syncToStore);

// Global counters for debugging
let totalRenderCount = 0;

// Simulates the storyboard-scrubber component that subscribes to entire root store
function StoryboardScrubber() {
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  totalRenderCount++;

  // Log to console to track render explosion
  if (totalRenderCount % 50 === 0) {
    console.log(`[StoryboardScrubber] Total renders: ${totalRenderCount}, this component: ${renderCountRef.current}`);
  }

  // This is the problematic pattern - subscribing to entire root store
  const {
    isPlaying,
    isPaused,
    globalTimeMs,
    totalDurationMs,
    scenes,
    isScrubbing,
  } = useSelect(ttsPlayerStore);

  const progressPercent = totalDurationMs > 0 ? (globalTimeMs / totalDurationMs) * 100 : 0;

  return (
    <div style={{ padding: "10px", border: "1px solid #ccc", margin: "10px 0" }}>
      <h3>StoryboardScrubber (subscribes to root store)</h3>
      <div>Render count: <strong style={{ color: renderCountRef.current > 100 ? "red" : "green" }}>{renderCountRef.current}</strong></div>
      <div>Status: {isPlaying ? "Playing" : isPaused ? "Paused" : "Stopped"}</div>
      <div>Time: {globalTimeMs}ms / {totalDurationMs}ms</div>
      <div>Progress: {progressPercent.toFixed(1)}%</div>
      <div>Scenes: {scenes.length}</div>
      <div>Scrubbing: {isScrubbing ? "Yes" : "No"}</div>
      <div style={{ 
        width: "100%", 
        height: "20px", 
        background: "#eee", 
        borderRadius: "4px",
        overflow: "hidden"
      }}>
        <div style={{ 
          width: `${progressPercent}%`, 
          height: "100%", 
          background: "#4CAF50",
          transition: "width 0.1s"
        }} />
      </div>
    </div>
  );
}

// Simulates storyboard-scene-preview-button which subscribes to individual fields
function ScenePreviewButton({ sceneIndex }: { sceneIndex: number }) {
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  const isPlaying = useSelect(ttsPlayerStore.isPlaying);
  const isPaused = useSelect(ttsPlayerStore.isPaused);
  const isLoading = useSelect(ttsPlayerStore.isLoading);
  const selectedSceneId = useSelect(ttsPlayerStore.selectedSceneId);

  return (
    <div style={{ 
      padding: "10px", 
      border: "1px solid #666", 
      borderRadius: "4px",
      background: selectedSceneId === `scene-${sceneIndex}` ? "#e3f2fd" : "white"
    }}>
      <div>Scene {sceneIndex}</div>
      <div style={{ fontSize: "10px", color: "#666" }}>
        renders: {renderCountRef.current}
      </div>
      <div style={{ fontSize: "10px" }}>
        {isPlaying ? "▶" : isPaused ? "⏸" : "⏹"} {isLoading ? "..." : ""}
      </div>
    </div>
  );
}

// Component that subscribes to individual fields (recommended pattern)
function OptimizedScrubber() {
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // Subscribe to individual fields - more efficient
  const isPlaying = useSelect(ttsPlayerStore.isPlaying);
  const globalTimeMs = useSelect(ttsPlayerStore.globalTimeMs);
  const totalDurationMs = useSelect(ttsPlayerStore.totalDurationMs);

  const progressPercent = totalDurationMs > 0 ? (globalTimeMs / totalDurationMs) * 100 : 0;

  return (
    <div style={{ padding: "10px", border: "1px solid #4CAF50", margin: "10px 0" }}>
      <h3>OptimizedScrubber (subscribes to individual fields)</h3>
      <div>Render count: <strong style={{ color: renderCountRef.current > 100 ? "red" : "green" }}>{renderCountRef.current}</strong></div>
      <div>Status: {isPlaying ? "Playing" : "Paused"}</div>
      <div>Time: {globalTimeMs}ms / {totalDurationMs}ms</div>
      <div>Progress: {progressPercent.toFixed(1)}%</div>
      <div style={{ 
        width: "100%", 
        height: "20px", 
        background: "#eee", 
        borderRadius: "4px",
        overflow: "hidden"
      }}>
        <div style={{ 
          width: `${progressPercent}%`, 
          height: "100%", 
          background: "#4CAF50",
          transition: "width 0.1s"
        }} />
      </div>
    </div>
  );
}

// Component to detect if renders are happening when they shouldn't
function IdleRenderDetector() {
  const renderCountRef = useRef(0);
  const [, forceUpdate] = useState(0);
  
  renderCountRef.current++;
  
  useEffect(() => {
    // Check every second if renders are still happening
    const interval = setInterval(() => {
      forceUpdate(c => c + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const { globalTimeMs } = useSelect(ttsPlayerStore);
  
  return (
    <div style={{ 
      padding: "10px", 
      margin: "10px 0",
      background: renderCountRef.current > 100 ? "#ffebee" : "#e8f5e9",
      border: `2px solid ${renderCountRef.current > 100 ? "red" : "green"}`
    }}>
      <h3>Idle Render Detector</h3>
      <div>Renders since mount: <strong>{renderCountRef.current}</strong></div>
      <div>Current time: {globalTimeMs}ms</div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        This updates every second. If render count climbs rapidly without user action = BUG!
      </div>
    </div>
  );
}

// Main App component
function App() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);
  const [updateInterval, setUpdateInterval] = useState(50); // ms between updates
  const intervalRef = useRef<number | null>(null);

  // Simulate audio timeupdate events through the fake machine (like production)
  const startSimulation = () => {
    if (intervalRef.current) return;
    
    setIsSimulating(true);
    fakeMachine.play();
    
    let time = ttsPlayerStore.globalTimeMs.get();
    const totalDuration = ttsPlayerStore.totalDurationMs.get();
    
    intervalRef.current = window.setInterval(() => {
      time += updateInterval;
      if (time > totalDuration) {
        time = 0; // Loop
      }
      
      // This goes through the machine -> syncToStore -> ttsPlayerStore.update()
      // Just like production: audio timeupdate -> XState TIME_UPDATE -> syncToRedux
      fakeMachine.updateTime(time);
      
      setUpdateCount(c => c + 1);
    }, updateInterval);
  };

  const stopSimulation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsSimulating(false);
    fakeMachine.pause();
  };

  const reset = () => {
    stopSimulation();
    fakeMachine.updateTime(0);
    setUpdateCount(0);
  };

  // Rapid fire test - simulates what might happen in production
  const rapidFireTest = () => {
    console.log("Starting rapid fire test (through machine)...");
    const start = performance.now();
    const initialSyncCount = fakeMachine.getSyncCount();
    
    // Simulate 100 rapid updates through the machine (like 25 seconds of playback)
    for (let i = 0; i < 100; i++) {
      fakeMachine.updateTime(i * 250);
    }
    
    const elapsed = performance.now() - start;
    const syncCount = fakeMachine.getSyncCount() - initialSyncCount;
    console.log(`Rapid fire test completed in ${elapsed.toFixed(2)}ms, syncToStore called ${syncCount} times`);
    setUpdateCount(c => c + 100);
  };

  // Direct store update test (bypasses machine)
  const directUpdateTest = () => {
    console.log("Starting direct update test...");
    const start = performance.now();
    
    for (let i = 0; i < 100; i++) {
      ttsPlayerStore.globalTimeMs.set(i * 250);
    }
    
    const elapsed = performance.now() - start;
    console.log(`Direct update test completed in ${elapsed.toFixed(2)}ms`);
    setUpdateCount(c => c + 100);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Deepstate Render Loop Test</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <p>This page helps reproduce the render loop issue that causes stack overflow in Safari.</p>
        <p>Open your browser's Performance tab to see if renders are cascading.</p>
      </div>

      <div style={{ marginBottom: "20px", padding: "10px", background: "#f5f5f5" }}>
        <h3>Controls</h3>
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
          <button 
            onClick={isSimulating ? stopSimulation : startSimulation}
            style={{ padding: "10px 20px", fontSize: "16px" }}
          >
            {isSimulating ? "Stop" : "Start"} Simulation
          </button>
          <button 
            onClick={reset}
            style={{ padding: "10px 20px", fontSize: "16px" }}
          >
            Reset
          </button>
          <button 
            onClick={rapidFireTest}
            style={{ padding: "10px 20px", fontSize: "16px", background: "#ff9800", color: "white", border: "none" }}
          >
            Rapid Fire (via Machine)
          </button>
          <button 
            onClick={directUpdateTest}
            style={{ padding: "10px 20px", fontSize: "16px", background: "#9c27b0", color: "white", border: "none" }}
          >
            Direct Update Test
          </button>
        </div>
        
        <div style={{ marginBottom: "10px" }}>
          <label>
            Update interval (ms): 
            <input 
              type="range" 
              min="10" 
              max="500" 
              value={updateInterval}
              onChange={(e) => setUpdateInterval(Number(e.target.value))}
              style={{ marginLeft: "10px" }}
            />
            <span style={{ marginLeft: "10px" }}>{updateInterval}ms</span>
          </label>
        </div>
        
        <div>Total updates sent: <strong>{updateCount}</strong></div>
      </div>

      <StoryboardScrubber />
      <OptimizedScrubber />
      
      {/* Multiple scene preview buttons like production */}
      <div style={{ padding: "10px", border: "1px solid #999", margin: "10px 0" }}>
        <h3>Scene Preview Buttons (5 instances, each subscribes to isPlaying, isPaused, isLoading, selectedSceneId)</h3>
        <div style={{ display: "flex", gap: "10px" }}>
          {[1, 2, 3, 4, 5].map(i => (
            <ScenePreviewButton key={i} sceneIndex={i} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: "20px", padding: "10px", background: "#fff3cd", border: "1px solid #ffc107" }}>
        <h3>What to look for:</h3>
        <ul>
          <li>Watch the "Render count" in both components</li>
          <li>The root store subscriber (top) may render more than the optimized one (bottom)</li>
          <li>In Safari, rapid updates might cause stack overflow</li>
          <li>Open DevTools Performance tab and record while clicking "Rapid Fire Test"</li>
          <li>Look for cascading "commitHookEffectListMount" calls in the flame graph</li>
          <li><strong>KEY TEST:</strong> After stopping simulation, do render counts keep increasing? If yes = infinite loop!</li>
        </ul>
      </div>
      
      <IdleRenderDetector />
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
