import React, { useState, useEffect, useRef } from 'react';
import { Camera, StopCircle, Zap, ShieldAlert, Activity } from 'lucide-react';

function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected, error
  const [detections, setDetections] = useState([]);
  const [processedImg, setProcessedImg] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isStreamingRef = useRef(false);

  const startStream = async () => {
    try {
      setStatus('connecting');
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'environment' } 
      });
      
      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      
      // Explicitly play the video
      await videoRef.current.play();
      
      // Connect to WebSocket (dynamically use the production URL if not on localhost)
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Replace this URL with your Render backend URL once it's deployed!
      const backendHost = window.location.hostname === 'localhost' ? 'localhost:8000' : 'YOUR-RENDER-BACKEND-URL.onrender.com';
      wsRef.current = new WebSocket(`${wsProtocol}//${backendHost}/api/ws/detect`);
      
      wsRef.current.onopen = () => {
        setStatus('connected');
        setIsStreaming(true);
        isStreamingRef.current = true;
        sendFrames();
      };
      
      wsRef.current.onmessage = (event) => {
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
        setStatus('error');
        stopStream();
      };
      
    } catch (err) {
      console.error("Error accessing camera or connecting to server:", err);
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
    
    if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Send frame as JPEG blob
      canvas.toBlob((blob) => {
        if (blob && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(blob);
        }
      }, 'image/jpeg', 0.6); // Slightly compressed to improve latency
    }
    
    // Throttle frames to ~15 FPS to avoid overloading server
    setTimeout(() => {
      if (isStreamingRef.current) {
        animationFrameRef.current = requestAnimationFrame(sendFrames);
      }
    }, 1000 / 15);
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
