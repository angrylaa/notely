// src/App.jsx

/* to set up an infinite canvas we have the following:
1. global coordinates system
2. visible screen / viewport within infinite canvas
3. state management -> state of canvas, screen position, zoom level
4. event handling (panning, zooming, adding/editing elements)
5. rendering -> render elements from infinite onto visible screen*/

import GlobalCanvas from "./components/GlobalCanvas";
export default function App() {
  return <GlobalCanvas />;
}
