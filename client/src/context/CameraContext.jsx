import { createContext, useContext, useState } from "react";

const CameraContext = createContext(null);

export const CameraProvider = ({ children }) => {
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });

  return (
    <CameraContext.Provider value={{ camera, setCamera }}>
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = () => {
  const ctx = useContext(CameraContext);
  if (!ctx) {
    throw new Error("useCamera must be used inside CameraProvider");
  }
  return ctx;
};
