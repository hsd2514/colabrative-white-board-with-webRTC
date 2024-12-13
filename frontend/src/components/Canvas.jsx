import React, { useEffect } from "react";

const Canvas = ({
  canvasRef,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  currentSize,
  isRoomFull,
  currentTool, // Ensure currentTool prop is received
}) => {
  useEffect(() => {
    if (canvasRef.current) {
      if (currentTool === "eraser") {
        canvasRef.current.style.cursor = "url('/eraser-cursor.png'), auto"; // Ensure the cursor image exists
      } else {
        canvasRef.current.style.cursor = "default";
      }
    }
  }, [currentTool]);

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseOut={handleMouseUp}
        className="whiteboard-canvas"
      />
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
    </div>
  );
};

export default Canvas;
