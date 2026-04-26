import React, { useState, useEffect, useRef } from 'react';
import { Camera, StopCircle, Zap, ShieldAlert, Activity } from 'lucide-react';

function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected, error
  const [errorMessage, setErrorMessage] = useState('');
  const [detections, setDetections] = useState([]);
  const [processedImg, setProcessedImg] = useState(null);
  const [debugInfo, setDebugInfo] = useState({ sent: 0, received: 0, readyState: 0, vWidth: 0 });
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isStreamingRef = useRef(false);
  const isWaitingForFrameRef = useRef(false); // Track if we are waiting for a server response

  const startStream = async () => {
    try {
      setStatus('connecting');
      setErrorMessage('');
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'environment' } 
      });
      
      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      
      // Explicitly play the video
      await videoRef.current.play();
      
      // Connect to WebSocket using the current host (works for unified deployment)
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host; // Will be localhost:5173 locally, or render URL in prod
      
      // If we're running the Vite dev server (port 5173), point to the backend port 8000
      const finalHost = wsHost.includes('5173') ? 'localhost:8000' : wsHost;
      
      const wsUrl = `${wsProtocol}//${finalHost}/api/ws/detect`;
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setStatus('connected');
        setIsStreaming(true);
        isStreamingRef.current = true;
        sendFrames();
      };
      
      wsRef.current.onmessage = (event) => {
        isWaitingForFrameRef.current = false; // Server finished processing, we can send next frame!
        const data = JSON.parse(event.data);
        if (data.image) {
          setProcessedImg(`data:image/jpeg;base64,${data.image}`);
        }
        if (data.detections) {
          setDetections(data.detections);
        }
      };
      
      wsRef.current.onclose = () => {
        stopStream();
      };
      
      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setErrorMessage(`WebSocket connection failed at ${wsUrl}. Check if server is running.`);
        setStatus('error');
        stopStream();
      };
      
    } catch (err) {
      console.error("Error accessing camera or connecting to server:", err);
      setErrorMessage(err.message || err.name || String(err));
      setStatus('error');
    }
  };

  const stopStream = () => {
    setIsStreaming(false);
    isStreamingRef.current = false;
    setStatus('disconnected');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setProcessedImg(null);
    setDetections([]);
  };

  const sendFrames = () => {
    if (!isStreamingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video) {
      setDebugInfo(prev => ({ ...prev, readyState: video.readyState, vWidth: video.videoWidth }));
    }
    
    if (!isWaitingForFrameRef.current && video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
      // Downscale to 320x240 to save bandwidth and drastically reduce backend memory usage
      const targetWidth = 320;
      const targetHeight = 240;
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      
      // Send frame as JPEG blob
      canvas.toBlob((blob) => {
        if (blob && wsRef.current.readyState === WebSocket.OPEN) {
          isWaitingForFrameRef.current = true; // Block new frames until this one returns
          wsRef.current.send(blob);
          
          // Failsafe: if the server drops the frame or takes too long, unblock after 500ms
          setTimeout(() => {
            isWaitingForFrameRef.current = false;
          }, 500);
        }
      }, 'image/jpeg', 0.6); // Slightly compressed to improve latency
    }
    
    // Check frequently (30 FPS), but only actually send if the server isn't busy
    setTimeout(() => {
      if (isStreamingRef.current) {
        animationFrameRef.current = requestAnimationFrame(sendFrames);
      }
    }, 1000 / 30);
  };

  useEffect(() => {
    return () => stopStream();
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Live AI Detector</h1>
        <p>Real-time object detection powered by YOLO</p>
      </header>

      <div className="glass-panel">
        <div className="detector-container">
          
          <div className="video-section">
            <div className="status-badge">
              <div className={`status-indicator ${status === 'connected' ? 'active' : status === 'error' ? 'error' : ''}`}></div>
              {status === 'connected' ? 'System Active' : status === 'connecting' ? 'Connecting...' : status === 'error' ? 'Connection Error' : 'System Standby'}
            </div>
            
            {errorMessage && (
              <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.9rem', width: '100%', textAlign: 'center' }}>
                Error: {errorMessage}
              </div>
            )}
            
            <div className="video-wrapper">
              {/* Hidden video and canvas for capturing frames */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} 
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              {processedImg ? (
                <img src={processedImg} alt="Processed frame" />
              ) : isStreaming ? (
                <div className="placeholder">
                  <Activity className="animate-spin" size={48} />
                  <p>Processing stream...</p>
                </div>
              ) : (
                <div className="placeholder">
                  <Camera size={64} opacity={0.5} />
                  <p>Camera is offline. Click Start to begin detection.</p>
                </div>
              )}
            </div>

            <div className="controls">
              {!isStreaming ? (
                <button className="btn btn-primary" onClick={startStream} disabled={status === 'connecting'}>
                  <Camera size={20} />
                  Start Detection
                </button>
              ) : (
                <button className="btn btn-danger" onClick={stopStream}>
                  <StopCircle size={20} />
                  Stop Stream
                </button>
              )}
            </div>
          </div>

          <div className="results-section">
            <h2>
              <Zap size={24} color="var(--accent)" />
              Live Detections
            </h2>
            
            <div className="glass-panel" style={{ padding: '1rem', height: '100%', minHeight: '300px' }}>
              {detections.length > 0 ? (
                <div className="detection-list">
                  {detections.map((det, idx) => (
                    <div key={idx} className="detection-item">
                      <span className="detection-label">{det.label}</span>
                      <span className="detection-conf">{(det.confidence * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="placeholder" style={{ height: '100%', justifyContent: 'center' }}>
                  {isStreaming ? (
                    <>
                      <Activity size={32} opacity={0.5} />
                      <p>Scanning environment...</p>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={32} opacity={0.5} />
                      <p>No active feed</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
