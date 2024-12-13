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
  const [currentTool, setCurrentTool] = useState("freehand");
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
  const remoteAudioRef = useRef(null);

  const ICE_SERVERS = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const videoPeerConnection = useRef(null);

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

      const imgData = contextRef.current.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const width = window.innerWidth - 60;
      const height = window.innerHeight;

      canvas.width = width;
      canvas.height = height;

      contextRef.current.lineCap = "round";
      contextRef.current.strokeStyle = strokeColor;
      contextRef.current.lineWidth = strokeWidth;

      contextRef.current.putImageData(imgData, 0, 0);
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(canvas.parentElement);

    window.addEventListener("resize", resizeCanvas);

    setIsCanvasInitialized(true);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      resizeObserver.disconnect();
    };
  }, [strokeColor, strokeWidth]);

  useEffect(() => {
    if (isCanvasInitialized) {
      redrawCanvas(history);
    }
  }, [history, isCanvasInitialized]);

  useEffect(() => {
    if (currentRoom) {
      ws.current = new WebSocket(
        `${import.meta.env.VITE_BACKEND_URL}/${currentRoom}`
      );

      ws.current.onopen = () => {
        console.log("Connected to room:", currentRoom);
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
          audio: true,
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log("Local video and audio stream set.");
        }
        if (peerConnection.current) {
          stream.getTracks().forEach((track) => {
            peerConnection.current.addTrack(track, stream);
            console.log("Added data peer track:", track.kind);
          });
        }
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

  const initiateConnection = async () => {
    peerConnection.current = new RTCPeerConnection(ICE_SERVERS);
    console.log("Data PeerConnection initialized.");

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
      if (stroke.type === "undo") {
        handleRemoteUndo(stroke.strokeId);
      } else if (stroke.type === "redo") {
        handleRemoteRedo(stroke);
      } else {
        addStroke(stroke, false);
      }
    };

    videoPeerConnection.current = new RTCPeerConnection(ICE_SERVERS);
    console.log("Video PeerConnection initialized.");

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

    videoPeerConnection.current.onerror = (error) => {
      console.error("Video PeerConnection error:", error);
    };

    videoPeerConnection.current.onremovetrack = (event) => {
      console.log("Remote video track removed:", event.track.kind);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        console.log("Remote video stream removed.");
      }
    };

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

    const offerData = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offerData);
    console.log("Data offer created and set as local description.");

    const offerVideo = await videoPeerConnection.current.createOffer();
    await videoPeerConnection.current.setLocalDescription(offerVideo);
    console.log("Video offer created and set as local description.");

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

  const handleOffer = async (offer, type) => {
    if (type === "data") {
      peerConnection.current = new RTCPeerConnection(ICE_SERVERS);
      console.log("Data PeerConnection initialized from offer.");

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
          if (stroke.type === "undo") {
            handleRemoteUndo(stroke.strokeId);
          } else if (stroke.type === "redo") {
            handleRemoteRedo(stroke);
          } else {
            addStroke(stroke, false);
          }
        };
      };

      await peerConnection.current.setRemoteDescription(offer);
      console.log("Data remote description set.");

      const answerData = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answerData);
      console.log("Data answer created and set as local description.");

      ws.current.send(
        JSON.stringify({
          type: "answer-data",
          answer: peerConnection.current.localDescription,
          senderId: clientId.current,
        })
      );
      console.log("Data answer sent via WebSocket.");

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
      videoPeerConnection.current = new RTCPeerConnection(ICE_SERVERS);
      console.log("Video PeerConnection initialized from offer.");

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

      await videoPeerConnection.current.setRemoteDescription(offer);
      console.log("Video remote description set.");

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

      const answerVideo = await videoPeerConnection.current.createAnswer();
      await videoPeerConnection.current.setLocalDescription(answerVideo);
      console.log("Video answer created and set as local description.");

      ws.current.send(
        JSON.stringify({
          type: "answer-video",
          answer: videoPeerConnection.current.localDescription,
          senderId: clientId.current,
        })
      );
      console.log("Video answer sent via WebSocket.");

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

  const handleAnswer = async (answer, type) => {
    if (type === "data" && peerConnection.current) {
      await peerConnection.current.setRemoteDescription(answer);
      console.log("Data PeerConnection remote description set.");
    } else if (type === "video" && videoPeerConnection.current) {
      await videoPeerConnection.current.setRemoteDescription(answer);
      console.log("Video PeerConnection remote description set.");
    }
  };

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

  const addStroke = (stroke, emit = true) => {
    if (emit) {
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
      setHistory((prevHistory) => [...prevHistory, stroke]);
      drawStrokeOnCanvas(stroke);
    }
  };

  // Update drawStrokeOnCanvas function
  const drawStrokeOnCanvas = (stroke) => {
    const context = contextRef.current;
    const canvas = canvasRef.current;

    if (!context || !canvas) return;

    context.save();
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = stroke.color || strokeColor;
    context.lineWidth = stroke.width || strokeWidth;

    if (stroke.type === "eraser") {
      context.globalCompositeOperation = "destination-out";
    } else {
      context.globalCompositeOperation = "source-over";
    }

    switch (stroke.type) {
      case "text":
        context.font = `${stroke.width * 10}px Arial`;
        context.fillStyle = stroke.color || strokeColor;
        context.fillText(
          stroke.text,
          stroke.x * canvas.width,
          stroke.y * canvas.height
        );
        break;

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

        context.moveTo(
          stroke.start.x * canvas.width,
          stroke.start.y * canvas.height
        );
        context.lineTo(
          stroke.end.x * canvas.width,
          stroke.end.y * canvas.height
        );

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

    if (stroke.type !== "text") {
      context.stroke();
    }
    context.restore();
  };

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
    if (
      !isDrawing.current ||
      !canvasRef.current ||
      !contextRef.current ||
      isRoomFull
    )
      return;

    const { offsetX, offsetY } = e.nativeEvent;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const x = offsetX / w;
    const y = offsetY / h;

    if (
      (currentTool === "freehand" || currentTool === "eraser") &&
      currentStroke.current
    ) {
      // For freehand/eraser, just draw the new segment
      const context = contextRef.current;
      const lastPoint =
        currentStroke.current.points[currentStroke.current.points.length - 1];

      context.save();
      context.beginPath();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle =
        currentTool === "eraser" ? "rgba(0,0,0,1)" : strokeColor;
      context.lineWidth = strokeWidth;
      context.globalCompositeOperation =
        currentTool === "eraser" ? "destination-out" : "source-over";

      context.moveTo(lastPoint.x * w, lastPoint.y * h);
      context.lineTo(x * w, y * h);
      context.stroke();
      context.restore();

      currentStroke.current.points.push({ x, y });
    } else if (["line", "rectangle", "arrow"].includes(currentTool)) {
      // For shapes, redraw everything
      redrawCanvas(history);
      drawStrokeOnCanvas(
        {
          type: currentTool,
          start: startPos.current,
          end: { x, y },
          color: strokeColor,
          width: strokeWidth,
        },
        true
      );
    }

    // Update dimensions if needed
    if (["line", "rectangle", "arrow"].includes(currentTool)) {
      const width = Math.abs(x - startPos.current.x) * w;
      const height = Math.abs(y - startPos.current.y) * h;
      setCurrentSize({ width, height });
    }
  };

  const handleMouseUp = (e) => {
    if (!isDrawing.current) return;
    if (!canvasRef.current || !contextRef.current || isRoomFull) return;

    isDrawing.current = false;

    if (
      (currentTool === "freehand" || currentTool === "eraser") &&
      currentStroke.current
    ) {
      const finalStroke = {
        ...currentStroke.current,
        color: strokeColor,
        width: strokeWidth,
      };
      addStroke(finalStroke, true);
    } else if (["line", "rectangle", "arrow"].includes(currentTool)) {
      const { offsetX, offsetY } = e.nativeEvent;
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;

      const finalStroke = {
        strokeId: uuidv4(),
        type: currentTool,
        start: startPos.current,
        end: { x: offsetX / w, y: offsetY / h },
        color: strokeColor,
        width: strokeWidth,
      };

      addStroke(finalStroke, true);
    }

    currentStroke.current = null;
    setCurrentSize(null);
    setIsErasing(false);
  };

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

  const handleRedo = () => {
    if (redoStack.length === 0) return;

    const strokeToRedo = redoStack[redoStack.length - 1];

    setRedoStack((prevRedo) => prevRedo.slice(0, -1));
    setHistory((prevHistory) => [...prevHistory, strokeToRedo]);

    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(JSON.stringify(strokeToRedo));
    }
  };

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

  const handleRemoteRedo = (stroke) => {
    setHistory((prevHistory) => [...prevHistory, stroke]);
  };

  const createRoom = () => {
    const newRoom = uuidv4();
    setRoom(newRoom);
    setCurrentRoom(newRoom);
  };

  const joinRoom = () => {
    if (room.trim() !== "") {
      setCurrentRoom(room.trim());
    } else {
      alert("Please enter a valid Room ID to join.");
    }
  };

  const copyRoomId = () => {
    if (room.trim() !== "") {
      navigator.clipboard.writeText(room);
      alert("Room ID copied to clipboard!");
    } else {
      alert("No Room ID to copy. Please create or join a room first.");
    }
  };

  const selectTool = (tool) => {
    setCurrentTool(tool);
  };

  const saveCanvasAsImage = () => {
    if (canvasRef.current && contextRef.current) {
      const canvas = canvasRef.current;
      const context = contextRef.current;

      const scaleFactor = 2;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width * scaleFactor;
      tempCanvas.height = canvas.height * scaleFactor;
      const tempContext = tempCanvas.getContext("2d");

      tempContext.fillStyle = "white";
      tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      tempContext.scale(scaleFactor, scaleFactor);
      tempContext.drawImage(canvas, 0, 0);

      const image = tempCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = "whiteboard.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log("Canvas saved as high-resolution image.");

      tempCanvas.remove();
    } else {
      console.error("Canvas or context reference is null.");
    }
  };

  const clearCanvas = () => {
    if (canvasRef.current && contextRef.current) {
      const context = contextRef.current;
      const canvas = canvasRef.current;
      context.clearRect(0, 0, canvas.width, canvas.height);
      setHistory([]);
      setRedoStack([]);

      // Send clear canvas event to peer
      if (dataChannel.current && dataChannel.current.readyState === "open") {
        dataChannel.current.send(JSON.stringify({ type: "clear" }));
      }
    }
  };

  // Update handleTextSubmit function
  const handleTextSubmit = (text, position) => {
    if (!text.trim()) return;

    const textStroke = {
      strokeId: uuidv4(),
      type: "text",
      text: text,
      x: position.x,
      y: position.y,
      color: strokeColor,
      width: strokeWidth,
    };

    addStroke(textStroke, true);
  };

  return (
    <div className="App">
      <Toolbar
        currentTool={currentTool}
        selectTool={selectTool}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        handleSave={saveCanvasAsImage}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        isErasing={isErasing}
        handleClear={clearCanvas}
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
            currentTool={currentTool}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            handleTextSubmit={handleTextSubmit}
          />
        </div>
      </div>
      <VideoFeeds
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        cameraError={cameraError}
      />{" "}
      <audio ref={remoteAudioRef} autoPlay />{" "}
      <RoomControls
        room={room}
        setRoom={setRoom}
        isRoomFull={isRoomFull}
        copyRoomId={copyRoomId}
        joinRoom={joinRoom}
        createRoom={createRoom}
      />{" "}
    </div>
  );
}
export default App;
