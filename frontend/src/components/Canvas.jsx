import React, { useEffect, useState } from "react";

const Canvas = ({
  canvasRef,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  currentSize,
  isRoomFull,
  currentTool,
  strokeColor,
  strokeWidth,
  handleTextSubmit, // Add this prop
}) => {
  const [textInput, setTextInput] = useState("");
  const [textBoxArea, setTextBoxArea] = useState(null);

  useEffect(() => {
    if (canvasRef.current) {
      if (currentTool === "eraser") {
        canvasRef.current.style.cursor = "url('/eraser-cursor.png'), auto";
      } else {
        canvasRef.current.style.cursor = "default";
      }
    }
  }, [currentTool]);

  const clearCanvas = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleTextEnter = (e) => {
    if (e.key === "Enter" && !e.shiftKey && textInput.trim()) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.font = `${strokeWidth * 10}px Arial`;
      ctx.fillStyle = strokeColor;
      ctx.fillText(
        textInput,
        textBoxArea.x * canvasRef.current.width,
        textBoxArea.y * canvasRef.current.height
      );
      setTextInput("");
      setTextBoxArea(null);
    }
  };

  const handleCanvasClick = (e) => {
    if (currentTool === "text") {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvasRef.current.width;
      const y = (e.clientY - rect.top) / canvasRef.current.height;
      setTextBoxArea({ x, y });
    }
  };

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseOut={handleMouseUp}
        onClick={handleCanvasClick}
        className="whiteboard-canvas"
      />
      {textBoxArea && currentTool === "text" && (
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleTextEnter}
          style={{
            position: "absolute",
            left: textBoxArea.x * canvasRef.current.width + "px",
            top: textBoxArea.y * canvasRef.current.height + "px",
            border: "none",
            background: "transparent",
            outline: "none",
            color: strokeColor,
            fontSize: `${strokeWidth * 10}px`,
            fontFamily: "Arial",
            padding: "4px",
          }}
          autoFocus
        />
      )}
      {currentSize && (
        <div className="dimension-box">
          <span>Width: {currentSize.width}px</span>
          <span>Height: {currentSize.height}px</span>
        </div>
      )}
      {isRoomFull && (
        <div className="notification">
          Room is full. Only two participants are allowed.
        </div>
      )}
      <button className="clear-overlay-btn" onClick={clearCanvas}>
        Clear Canvas
      </button>
    </div>
  );
};

export default Canvas;
