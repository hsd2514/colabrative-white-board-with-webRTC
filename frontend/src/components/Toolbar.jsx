import React from "react";
import "./Toolbar.css";

const Toolbar = ({
  currentTool,
  selectTool,
  handleUndo,
  handleRedo,
  handleSave,
  handleClear,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
}) => {
  return (
    <div className="toolbar-container">
      <div className="toolbar">
        <div className="tool-section">
          <button
            className={`tool-btn ${currentTool === "freehand" ? "active" : ""}`}
            onClick={() => selectTool("freehand")}
            title="Pen"
          >
            ✎
          </button>
          <button
            className={`tool-btn ${currentTool === "eraser" ? "active" : ""}`}
            onClick={() => selectTool("eraser")}
            title="Eraser"
          >
            ⌫
          </button>
        </div>

        <div className="tool-section">
          <button
            className={`tool-btn ${currentTool === "line" ? "active" : ""}`}
            onClick={() => selectTool("line")}
            title="Line"
          >
            /
          </button>
          <button
            className={`tool-btn ${
              currentTool === "rectangle" ? "active" : ""
            }`}
            onClick={() => selectTool("rectangle")}
            title="Rectangle"
          >
            □
          </button>
          <button
            className={`tool-btn ${currentTool === "arrow" ? "active" : ""}`}
            onClick={() => selectTool("arrow")}
            title="Arrow"
          >
            →
          </button>
          <button
            className={`tool-btn ${currentTool === "text" ? "active" : ""}`}
            onClick={() => selectTool("text")}
            title="Text"
          >
            T
          </button>
        </div>

        <div className="tool-section">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            className="color-picker"
            title="Color"
          />
          <input
            type="range"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            className="width-slider"
            title="Brush Size"
          />
        </div>
      </div>

      <div className="bottom-tools">
        <button className="tool-btn" onClick={handleUndo} title="Undo">
          ↩
        </button>
        <button className="tool-btn" onClick={handleRedo} title="Redo">
          ↪
        </button>
        <button className="tool-btn" onClick={handleClear} title="Clear Canvas">
          🗑️
        </button>
        <button
          className="tool-btn save-btn"
          onClick={handleSave}
          title="Save as Image"
        >
          <i className="bi bi-download"></i>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
