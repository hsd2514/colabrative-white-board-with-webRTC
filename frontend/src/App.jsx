import React, { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import Toolbar from "./components/Toolbar";
import Canvas from "./components/Canvas";
import VideoFeeds from "./components/VideoFeeds";
import RoomControls from "./components/RoomControls";
import "./App.css";

function App() {
  const clientId = useRef(uuidv4());

  const [room, setRoom] = useState("");
  const [currentRoom, setCurrentRoom] = useState("");
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [currentTool, setCurrentTool] = useState("freehand"); // Add "eraser" as a possible value
  const [currentSize, setCurrentSize] = useState(null);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false);
  const [isRoomFull, setIsRoomFull] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [isErasing, setIsErasing] = useState(false);

  const ws = useRef(null);
  const peerConnection = useRef(null);
  const dataChannel = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const remoteAudioRef = useRef(null); // Added ref for remote audio

  // ICE Servers Configuration
  const ICE_SERVERS = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Add TURN servers here if needed
    ],
  };

  // Initialize a new PeerConnection for video
  const videoPeerConnection = useRef(null);

  // Initialization Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error("Canvas element not found.");
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      console.error("Canvas context is null.");
      return;
    }

    context.lineCap = "round";
    context.strokeStyle = strokeColor;
    context.lineWidth = strokeWidth;
    contextRef.current = context;

    const resizeCanvas = () => {
      if (!canvas || !contextRef.current) return;

      // Save current drawing
      const imgData = contextRef.current.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Get window dimensions
      const width = window.innerWidth - 60; // Subtract sidebar width
      const height = window.innerHeight;

      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      // Restore context properties
      contextRef.current.lineCap = "round";
      contextRef.current.strokeStyle = strokeColor;
      contextRef.current.lineWidth = strokeWidth;

      // Restore the drawing
      contextRef.current.putImageData(imgData, 0, 0);
    };

    // Initial resize
    resizeCanvas();

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(canvas.parentElement);

    // Add window resize listener
    window.addEventListener("resize", resizeCanvas);

    setIsCanvasInitialized(true);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      resizeObserver.disconnect();
    };
  }, [strokeColor, strokeWidth]);

  // Redraw Effect
  useEffect(() => {
    if (isCanvasInitialized) {
      redrawCanvas(history);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, isCanvasInitialized]);

  // WebSocket Effect for Signaling and Room Management
  useEffect(() => {
    if (currentRoom) {
      // Initialize WebSocket with environment variable
      ws.current = new WebSocket(
        `${import.meta.env.VITE_BACKEND_URL}/${currentRoom}`
      );

      ws.current.onopen = () => {
        console.log("Connected to room:", currentRoom);
        // Notify server of new participant
        ws.current.send(
          JSON.stringify({
            type: "join",
            senderId: clientId.current,
          })
        );
      };

      ws.current.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.senderId === clientId.current) return;

          switch (data.type) {
            case "join":
              if (!peerConnection.current && !isRoomFull) {
                await initiateConnection();
              }
              break;
            case "offer-data":
              await handleOffer(data.offer, "data");
              break;
            case "answer-data":
              await handleAnswer(data.answer, "data");
              break;
            case "ice-candidate-data":
              await handleNewICECandidate(data.candidate, "data");
              break;
            case "offer-video":
              await handleOffer(data.offer, "video");
              break;
            case "answer-video":
              await handleAnswer(data.answer, "video");
              break;
            case "ice-candidate-video":
              await handleNewICECandidate(data.candidate, "video");
              break;
            case "full":
              setIsRoomFull(true);
              alert("Room is full. Only two participants are allowed.");
              break;
            default:
              break;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.current.onclose = () => {
        console.log("WebSocket connection closed");
      };

      return () => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.close();
        }
      };
    }
  }, [currentRoom]);

  // Add useEffect to handle user media (camera)
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true, // Request audio
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log("Local video and audio stream set.");
        }
        // Add tracks to peer connection if already established
        if (peerConnection.current) {
          stream.getTracks().forEach((track) => {
            peerConnection.current.addTrack(track, stream);
            console.log("Added data peer track:", track.kind);
          });
        }
        // Add video tracks to videoPeerConnection only if it's initialized
        if (videoPeerConnection.current) {
          stream.getTracks().forEach((track) => {
            videoPeerConnection.current.addTrack(track, stream);
            console.log("Added video peer track:", track.kind);
          });
        }
      } catch (error) {
        console.error("Error accessing camera:", error);
        setCameraError("Unable to access camera. Please check permissions.");
      }
    };

    getMedia();
  }, []);

  // Handle remote audio stream
  useEffect(() => {
    if (videoPeerConnection.current) {
      videoPeerConnection.current.ontrack = (event) => {
        event.streams.forEach((stream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            console.log("Remote audio stream set.");
          }
        });
      };
    }
  }, []);

  // Modify initiateConnection to handle both data and video PeerConnections
  const initiateConnection = async () => {
    // Data PeerConnection
    peerConnection.current = new RTCPeerConnection(ICE_SERVERS);
    console.log("Data PeerConnection initialized.");

    // Handle ICE Candidates for data connection
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && ws.current) {
        ws.current.send(
          JSON.stringify({
            type: "ice-candidate-data",
            candidate: event.candidate,
            senderId: clientId.current,
          })
        );
        console.log("Data ICE candidate sent:", event.candidate);
      }
    };

    // Data Channel setup
    dataChannel.current = peerConnection.current.createDataChannel("drawData");
    dataChannel.current.onopen = () => {
      console.log("Data channel opened (initiator)");
    };
    dataChannel.current.onclose = () => {
      console.log("Data channel closed (initiator)");
    };
    dataChannel.current.onerror = (error) => {
      console.error("Data channel error (initiator):", error);
    };
    dataChannel.current.onmessage = (event) => {
      const stroke = JSON.parse(event.data);
      // ...existing message handling...
      if (stroke.type === "undo") {
        handleRemoteUndo(stroke.strokeId);
      } else if (stroke.type === "redo") {
        handleRemoteRedo(stroke);
      } else {
        addStroke(stroke, false);
      }
    };

    // Video PeerConnection
    videoPeerConnection.current = new RTCPeerConnection(ICE_SERVERS);
    console.log("Video PeerConnection initialized.");

    // Handle ICE Candidates for video connection
    videoPeerConnection.current.onicecandidate = (event) => {
      if (event.candidate && ws.current) {
        ws.current.send(
          JSON.stringify({
            type: "ice-candidate-video",
            candidate: event.candidate,
            senderId: clientId.current,
          })
        );
        console.log("Video ICE candidate sent:", event.candidate);
      }
    };

    // Handle remote video tracks
    videoPeerConnection.current.ontrack = (event) => {
      console.log("Received remote video track:", event.track.kind);
      const [stream] = event.streams;
      if (remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== stream) {
          remoteVideoRef.current.srcObject = stream;
          console.log("Remote video stream set.");
        }
      }
    };

    // Add error handling for video PeerConnection
    videoPeerConnection.current.onerror = (error) => {
      console.error("Video PeerConnection error:", error);
    };

    // Add logging for when remote video stream ends
    videoPeerConnection.current.onremovetrack = (event) => {
      console.log("Remote video track removed:", event.track.kind);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        console.log("Remote video stream removed.");
      }
    };

    // Add local video tracks to video PeerConnection
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => {
        videoPeerConnection.current.addTrack(
          track,
          localVideoRef.current.srcObject
        );
        console.log(
          "Added local video track to video peer connection:",
          track.kind
        );
      });
    } else {
      console.warn(
        "Local video stream is not available to add to videoPeerConnection."
      );
    }

    // Create Offer for data connection
    const offerData = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offerData);
    console.log("Data offer created and set as local description.");

    // Create Offer for video connection
    const offerVideo = await videoPeerConnection.current.createOffer();
    await videoPeerConnection.current.setLocalDescription(offerVideo);
    console.log("Video offer created and set as local description.");

    // Send Offers via WebSocket
    ws.current.send(
      JSON.stringify({
        type: "offer-data",
        offer: peerConnection.current.localDescription,
        senderId: clientId.current,
      })
    );
    console.log("Data offer sent via WebSocket.");

    ws.current.send(
      JSON.stringify({
        type: "offer-video",
        offer: videoPeerConnection.current.localDescription,
        senderId: clientId.current,
      })
    );
    console.log("Video offer sent via WebSocket.");

    // Monitor connection states
    peerConnection.current.onconnectionstatechange = () => {
      console.log(
        "Data Peer connection state:",
        peerConnection.current.connectionState
      );
      if (peerConnection.current.connectionState === "connected") {
        console.log("Data peer connection established.");
      }
    };

    videoPeerConnection.current.onconnectionstatechange = () => {
      console.log(
        "Video Peer connection state:",
        videoPeerConnection.current.connectionState
      );
      if (videoPeerConnection.current.connectionState === "connected") {
        console.log("Video peer connection established.");
      }
    };
  };

  // Modify handleOffer to handle data and video offers separately
  const handleOffer = async (offer, type) => {
    if (type === "data") {
      // Data PeerConnection
      peerConnection.current = new RTCPeerConnection(ICE_SERVERS);
      console.log("Data PeerConnection initialized from offer.");

      // Handle ICE Candidates for data connection
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && ws.current) {
          ws.current.send(
            JSON.stringify({
              type: "ice-candidate-data",
              candidate: event.candidate,
              senderId: clientId.current,
            })
          );
          console.log(
            "Data ICE candidate sent from receiver:",
            event.candidate
          );
        }
      };

      // Data Channel setup
      peerConnection.current.ondatachannel = (event) => {
        dataChannel.current = event.channel;
        dataChannel.current.onopen = () => {
          console.log("Data channel opened (receiver)");
        };
        dataChannel.current.onclose = () => {
          console.log("Data channel closed (receiver)");
        };
        dataChannel.current.onerror = (error) => {
          console.error("Data channel error (receiver):", error);
        };
        dataChannel.current.onmessage = (event) => {
          const stroke = JSON.parse(event.data);
          // ...existing message handling...
          if (stroke.type === "undo") {
            handleRemoteUndo(stroke.strokeId);
          } else if (stroke.type === "redo") {
            handleRemoteRedo(stroke);
          } else {
            addStroke(stroke, false);
          }
        };
      };

      // Set remote description for data connection
      await peerConnection.current.setRemoteDescription(offer);
      console.log("Data remote description set.");

      // Create and set local description (answer) for data connection
      const answerData = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answerData);
      console.log("Data answer created and set as local description.");

      // Send answer via WebSocket for data connection
      ws.current.send(
        JSON.stringify({
          type: "answer-data",
          answer: peerConnection.current.localDescription,
          senderId: clientId.current,
        })
      );
      console.log("Data answer sent via WebSocket.");

      // Monitor connection state
      peerConnection.current.onconnectionstatechange = () => {
        console.log(
          "Data Peer connection state:",
          peerConnection.current.connectionState
        );
        if (peerConnection.current.connectionState === "connected") {
          console.log("Data peer connection established.");
        }
      };
    } else if (type === "video") {
      // Video PeerConnection
      videoPeerConnection.current = new RTCPeerConnection(ICE_SERVERS);
      console.log("Video PeerConnection initialized from offer.");

      // Handle ICE Candidates for video connection
      videoPeerConnection.current.onicecandidate = (event) => {
        if (event.candidate && ws.current) {
          ws.current.send(
            JSON.stringify({
              type: "ice-candidate-video",
              candidate: event.candidate,
              senderId: clientId.current,
            })
          );
          console.log(
            "Video ICE candidate sent from receiver:",
            event.candidate
          );
        }
      };

      // Handle remote video tracks
      videoPeerConnection.current.ontrack = (event) => {
        console.log(
          "Received remote video track from receiver:",
          event.track.kind
        );
        const [stream] = event.streams;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          console.log("Remote video stream set from receiver.");
        }
      };

      // Set remote description for video connection
      await videoPeerConnection.current.setRemoteDescription(offer);
      console.log("Video remote description set.");

      // Add local video tracks to video PeerConnection BEFORE creating answer
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach((track) => {
          videoPeerConnection.current.addTrack(
            track,
            localVideoRef.current.srcObject
          );
          console.log(
            "Added local video track to video peer connection (receiver):",
            track.kind
          );
        });
      } else {
        console.warn(
          "Local video stream is not available to add to videoPeerConnection."
        );
      }

      // Create and set local description (answer) for video connection
      const answerVideo = await videoPeerConnection.current.createAnswer();
      await videoPeerConnection.current.setLocalDescription(answerVideo);
      console.log("Video answer created and set as local description.");

      // Send answer via WebSocket for video connection
      ws.current.send(
        JSON.stringify({
          type: "answer-video",
          answer: videoPeerConnection.current.localDescription,
          senderId: clientId.current,
        })
      );
      console.log("Video answer sent via WebSocket.");

      // Monitor connection state
      videoPeerConnection.current.onconnectionstatechange = () => {
        console.log(
          "Video Peer connection state:",
          videoPeerConnection.current.connectionState
        );
        if (videoPeerConnection.current.connectionState === "connected") {
          console.log("Video peer connection established from receiver.");
        }
      };
    }
  };

  // Modify handleAnswer to handle data and video answers separately
  const handleAnswer = async (answer, type) => {
    if (type === "data" && peerConnection.current) {
      await peerConnection.current.setRemoteDescription(answer);
      console.log("Data PeerConnection remote description set.");
    } else if (type === "video" && videoPeerConnection.current) {
      await videoPeerConnection.current.setRemoteDescription(answer);
      console.log("Video PeerConnection remote description set.");
    }
  };

  // Handle Received ICE Candidates for both connections
  const handleNewICECandidate = async (candidate, type) => {
    if (type === "data" && peerConnection.current) {
      try {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
        console.log("Added ICE candidate to Data PeerConnection.");
      } catch (error) {
        console.error("Error adding received ICE candidate for data:", error);
      }
    } else if (type === "video" && videoPeerConnection.current) {
      try {
        await videoPeerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
        console.log("Added ICE candidate to Video PeerConnection.");
      } catch (error) {
        console.error("Error adding received ICE candidate for video:", error);
      }
    }
  };

  // Modify addStroke to include logging and ensure strokes are sent when data channel is open
  const addStroke = (stroke, emit = true) => {
    if (emit) {
      // Include local user's strokeColor and strokeWidth
      const strokeWithStyle = {
        ...stroke,
        color: strokeColor,
        width: strokeWidth,
      };

      setHistory((prevHistory) => [...prevHistory, strokeWithStyle]);
      drawStrokeOnCanvas(strokeWithStyle);

      if (dataChannel.current) {
        console.log("Data channel readyState:", dataChannel.current.readyState);
        if (dataChannel.current.readyState === "open") {
          dataChannel.current.send(JSON.stringify(strokeWithStyle));
          setRedoStack([]);
          console.log("Stroke sent:", strokeWithStyle);
        } else {
          console.warn("Data channel is not open. Stroke not sent.");
        }
      } else {
        console.warn("Data channel is not initialized.");
      }
    } else {
      // Use the received stroke as is
      setHistory((prevHistory) => [...prevHistory, stroke]);
      drawStrokeOnCanvas(stroke);
    }
  };

  // Function to draw a single stroke on the canvas
  const drawStrokeOnCanvas = (stroke) => {
    const context = contextRef.current;
    const canvas = canvasRef.current;

    if (!context || !canvas) return;

    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";

    // Set drawing mode
    if (stroke.type === "eraser") {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(128,128,128,1)"; // Ensure full transparency
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = stroke.color || strokeColor;
    }

    context.lineWidth = stroke.width || strokeWidth;

    switch (stroke.type) {
      case "freehand":
      case "eraser":
        if (!stroke.points || stroke.points.length === 0) return;
        context.moveTo(
          stroke.points[0].x * canvas.width,
          stroke.points[0].y * canvas.height
        );
        stroke.points.forEach((point) => {
          context.lineTo(point.x * canvas.width, point.y * canvas.height);
        });
        break;

      case "line":
        context.moveTo(
          stroke.start.x * canvas.width,
          stroke.start.y * canvas.height
        );
        context.lineTo(
          stroke.end.x * canvas.width,
          stroke.end.y * canvas.height
        );
        break;

      case "rectangle":
        const startX = stroke.start.x * canvas.width;
        const startY = stroke.start.y * canvas.height;
        const endX = stroke.end.x * canvas.width;
        const endY = stroke.end.y * canvas.height;
        const width = endX - startX;
        const height = endY - startY;
        context.strokeRect(startX, startY, width, height);
        break;

      case "arrow":
        const headLength = 20;
        const dx = stroke.end.x * canvas.width - stroke.start.x * canvas.width;
        const dy =
          stroke.end.y * canvas.height - stroke.start.y * canvas.height;
        const angle = Math.atan2(dy, dx);

        // Draw line
        context.moveTo(
          stroke.start.x * canvas.width,
          stroke.start.y * canvas.height
        );
        context.lineTo(
          stroke.end.x * canvas.width,
          stroke.end.y * canvas.height
        );

        // Draw arrowhead
        context.lineTo(
          stroke.end.x * canvas.width -
            headLength * Math.cos(angle - Math.PI / 6),
          stroke.end.y * canvas.height -
            headLength * Math.sin(angle - Math.PI / 6)
        );
        context.moveTo(
          stroke.end.x * canvas.width,
          stroke.end.y * canvas.height
        );
        context.lineTo(
          stroke.end.x * canvas.width -
            headLength * Math.cos(angle + Math.PI / 6),
          stroke.end.y * canvas.height -
            headLength * Math.sin(angle + Math.PI / 6)
        );
        break;
    }

    context.stroke();
    context.closePath();
    context.globalCompositeOperation = "source-over";
  };

  // Redraw Canvas Function
  const redrawCanvas = (currentHistory) => {
    const context = contextRef.current;
    const canvas = canvasRef.current;

    if (!context || !canvas) {
      console.error("Cannot redraw: Context or Canvas is null.");
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    currentHistory.forEach((stroke) => {
      drawStrokeOnCanvas(stroke);
    });
  };

  // Mouse Event Handlers
  const handleMouseDown = (e) => {
    if (!canvasRef.current || !contextRef.current || isRoomFull) return;

    isDrawing.current = true;
    const { offsetX, offsetY } = e.nativeEvent;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const x = offsetX / w;
    const y = offsetY / h;
    startPos.current = { x, y };

    if (currentTool === "freehand" || currentTool === "eraser") {
      currentStroke.current = {
        strokeId: uuidv4(),
        type: currentTool,
        points: [{ x, y }],
      };
    }

    if (currentTool === "eraser") {
      setIsErasing(true);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current) return;
    if (!canvasRef.current || !contextRef.current || isRoomFull) return;

    const { offsetX, offsetY } = e.nativeEvent;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const x = offsetX / w;
    const y = offsetY / h;

    if (
      (currentTool === "freehand" || currentTool === "eraser") &&
      currentStroke.current
    ) {
      currentStroke.current.points.push({ x, y });
      const context = contextRef.current;
      const lastIndex = currentStroke.current.points.length - 1;
      if (lastIndex < 1) return;

      const x0 =
        currentStroke.current.points[lastIndex - 1].x * canvasRef.current.width;
      const y0 =
        currentStroke.current.points[lastIndex - 1].y *
        canvasRef.current.height;
      const x1 = x * canvasRef.current.width;
      const y1 = y * canvasRef.current.height;

      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.stroke();
      context.closePath();
    } else if (["line", "rectangle", "arrow"].includes(currentTool)) {
      // Preview the shape while drawing
      const context = contextRef.current;
      const canvas = canvasRef.current;

      // Clear the canvas and redraw history
      redrawCanvas(history);

      // Draw preview
      const previewStroke = {
        type: currentTool,
        start: startPos.current,
        end: { x, y },
        color: strokeColor,
        width: strokeWidth,
      };
      drawStrokeOnCanvas(previewStroke);
    }

    // Update current size for shapes
    if (
      ["line", "rectangle", "curve", "arrow"].includes(currentTool) &&
      isDrawing.current
    ) {
      const width = Math.abs(x - startPos.current.x) * canvasRef.current.width;
      const height =
        Math.abs(y - startPos.current.y) * canvasRef.current.height;
      setCurrentSize({ width, height });
    }
  };

  const handleMouseUp = (e) => {
    if (!isDrawing.current) return;
    if (!canvasRef.current || !contextRef.current || isRoomFull) return;

    isDrawing.current = false;
    const { offsetX, offsetY } = e.nativeEvent;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const x = offsetX / w;
    const y = offsetY / h;
    const endPos = { x, y };

    if (
      (currentTool === "freehand" || currentTool === "eraser") &&
      currentStroke.current
    ) {
      addStroke(currentStroke.current, true);
      currentStroke.current = null;
    } else if (["line", "rectangle", "curve", "arrow"].includes(currentTool)) {
      let stroke = null;

      if (currentTool === "line") {
        stroke = {
          strokeId: uuidv4(),
          type: "line",
          start: startPos.current,
          end: endPos,
        };
      } else if (currentTool === "rectangle") {
        stroke = {
          strokeId: uuidv4(),
          type: "rectangle",
          start: startPos.current,
          end: endPos,
        };
      } else if (currentTool === "curve") {
        // Revert to quadratic Bézier curve to maintain stroke data compatibility
        const dx = endPos.x - startPos.current.x;
        const dy = endPos.y - startPos.current.y;
        const control = {
          x: startPos.current.x + dx / 2,
          y: startPos.current.y + dy / 2 - Math.abs(dy) * 0.2, // Single control point
        };
        stroke = {
          strokeId: uuidv4(),
          type: "curve",
          start: startPos.current,
          control: control,
          end: endPos,
        };
      } else if (currentTool === "arrow") {
        stroke = {
          strokeId: uuidv4(),
          type: "arrow",
          start: startPos.current,
          end: endPos,
        };
      }

      if (stroke) {
        addStroke(stroke, true);
      }

      setCurrentSize(null);
    }

    setIsErasing(false);
  };

  // Undo Function
  const handleUndo = () => {
    if (history.length === 0) return;

    const lastStroke = history[history.length - 1];

    setHistory((prevHistory) => prevHistory.slice(0, -1));
    setRedoStack((prevRedo) => [...prevRedo, lastStroke]);

    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(
        JSON.stringify({
          type: "undo",
          strokeId: lastStroke.strokeId,
        })
      );
    }
  };

  // Redo Function
  const handleRedo = () => {
    if (redoStack.length === 0) return;

    const strokeToRedo = redoStack[redoStack.length - 1];

    setRedoStack((prevRedo) => prevRedo.slice(0, -1));
    setHistory((prevHistory) => [...prevHistory, strokeToRedo]);

    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(JSON.stringify(strokeToRedo));
    }
  };

  // Function to handle remote undo
  const handleRemoteUndo = (strokeId) => {
    setHistory((prevHistory) => {
      const strokeIndex = prevHistory.findIndex(
        (stroke) => stroke.strokeId === strokeId
      );
      if (strokeIndex === -1) return prevHistory;

      const strokeToUndo = prevHistory[strokeIndex];
      const newHistory = [
        ...prevHistory.slice(0, strokeIndex),
        ...prevHistory.slice(strokeIndex + 1),
      ];

      setRedoStack((prevRedo) => [...prevRedo, strokeToUndo]);

      return newHistory;
    });
  };

  // Function to handle remote redo
  const handleRemoteRedo = (stroke) => {
    setHistory((prevHistory) => [...prevHistory, stroke]);
  };

  // Function to create a new room
  const createRoom = () => {
    const newRoom = uuidv4();
    setRoom(newRoom);
    setCurrentRoom(newRoom);
  };

  // Function to join an existing room
  const joinRoom = () => {
    if (room.trim() !== "") {
      setCurrentRoom(room.trim());
    } else {
      alert("Please enter a valid Room ID to join.");
    }
  };

  // Function to copy Room ID to clipboard
  const copyRoomId = () => {
    if (room.trim() !== "") {
      navigator.clipboard.writeText(room);
      alert("Room ID copied to clipboard!");
    } else {
      alert("No Room ID to copy. Please create or join a room first.");
    }
  };

  // Function to select a drawing tool
  const selectTool = (tool) => {
    setCurrentTool(tool);
  };

  // Function to save the canvas as an image with higher resolution and white background
  const saveCanvasAsImage = () => {
    if (canvasRef.current && contextRef.current) {
      const canvas = canvasRef.current;
      const context = contextRef.current;

      // Create a temporary canvas for higher resolution
      const scaleFactor = 2; // Increase for higher resolution
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width * scaleFactor;
      tempCanvas.height = canvas.height * scaleFactor;
      const tempContext = tempCanvas.getContext("2d");

      // Fill the temporary canvas with white background
      tempContext.fillStyle = "white";
      tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Scale and draw the original canvas onto the temporary canvas
      tempContext.scale(scaleFactor, scaleFactor);
      tempContext.drawImage(canvas, 0, 0);

      // Generate image from the temporary canvas
      const image = tempCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = "whiteboard.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log("Canvas saved as high-resolution image.");

      // Clean up
      tempCanvas.remove();
    } else {
      console.error("Canvas or context reference is null.");
    }
  };

  return (
    <div className="App">
      <Toolbar
        currentTool={currentTool}
        selectTool={selectTool}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        handleSave={saveCanvasAsImage} // Ensure this prop is correctly passed
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        isErasing={isErasing}
      />
      <div className="main-container">
        <div className="content-container">
          <Canvas
            canvasRef={canvasRef}
            handleMouseDown={handleMouseDown}
            handleMouseMove={handleMouseMove}
            handleMouseUp={handleMouseUp}
            currentSize={currentSize}
            isRoomFull={isRoomFull}
          />
        </div>
      </div>
      <VideoFeeds
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        cameraError={cameraError}
      />
      <audio ref={remoteAudioRef} autoPlay /> {/* Added audio element */}
      <RoomControls
        room={room}
        setRoom={setRoom}
        isRoomFull={isRoomFull}
        copyRoomId={copyRoomId}
        joinRoom={joinRoom}
        createRoom={createRoom}
      />
    </div>
  );
}

export default App;
