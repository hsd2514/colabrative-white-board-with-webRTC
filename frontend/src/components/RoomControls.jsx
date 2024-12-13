import React from "react";
import { FaPlus, FaCopy, FaSignInAlt } from "react-icons/fa";

const RoomControls = ({
  room,
  setRoom,
  isRoomFull,
  copyRoomId,
  joinRoom,
  createRoom,
}) => (
  <div className="bottom-input">
    <input
      type="text"
      placeholder="Room ID"
      value={room}
      onChange={(e) => setRoom(e.target.value)}
      disabled={isRoomFull}
    />
    <button onClick={copyRoomId} className="copy-button" disabled={isRoomFull}>
      <FaCopy />
    </button>
    <button onClick={joinRoom} className="join-button" disabled={isRoomFull}>
      <FaSignInAlt /> Join
    </button>
    <button
      onClick={createRoom}
      className="create-button"
      disabled={isRoomFull}
    >
      <FaPlus /> Create
    </button>
  </div>
);

export default RoomControls;
