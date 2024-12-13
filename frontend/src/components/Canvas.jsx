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
  const [textPosition, setTextPosition] = useState(null);

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

  const handleCanvasClick = (e) => {
    if (currentTool === "text") {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvasRef.current.width;
      const y = (e.clientY - rect.top) / canvasRef.current.height;
      setTextPosition({ x, y });
    }
  };

  const handleTextKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && textInput.trim()) {
      e.preventDefault();
      handleTextSubmit(textInput, textPosition);
      setTextInput("");
      setTextPosition(null);
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
      {textPosition && currentTool === "text" && (
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleTextKeyDown}
          style={{
            position: "absolute",
            left: textPosition.x * canvasRef.current.width + "px",
            top: textPosition.y * canvasRef.current.height + "px",
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
