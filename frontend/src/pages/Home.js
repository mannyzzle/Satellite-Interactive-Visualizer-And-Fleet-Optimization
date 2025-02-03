import SatelliteList from "../components/SatelliteList";

function Home() {
  return (
    <div className="flex flex-col items-center p-10">
      <h1 className="text-3xl font-bold">Satellite Interactive Visualizer</h1>
      {/* The 3D Globe would go here */}
      <SatelliteList />
    </div>
  );
}

export default Home;
