import * as d3 from "d3";

export default function createVelocityHistogram(satellites) {
  // 1) Clear old DOM
  const container = d3.select("#velocity-histogram");
  container.selectAll("*").remove();

  // 2) Basic chart dimensions
  const width = 500;
  const height = 300;
  const margin = { top: 40, right: 30, bottom: 60, left: 70 };

  // 3) Create SVG
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("background", "#1f2937"); // tailwind gray-800 for background

  // 4) Prepare data
  const velocities = satellites
    .map((d) => +d.velocity)
    .filter((v) => !isNaN(v) && v > 0);

  // 5) Create scales
  const x = d3
    .scaleLinear()
    .domain(d3.extent(velocities))
    .nice()
    .range([margin.left, width - margin.right]);

  // Binning/histogram
  const bins = d3
    .histogram()
    .domain(x.domain())
    .thresholds(15)(velocities);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (b) => b.length) || 0])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // 6) Draw bars
  const bar = svg.selectAll(".bar").data(bins).enter().append("g").attr("class", "bar");

  bar
    .append("rect")
    .attr("x", (d) => x(d.x0) + 1)
    .attr("y", (d) => y(d.length))
    .attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("height", (d) => y(0) - y(d.length))
    .attr("fill", "#34d399"); // tailwind green-400

  // 7) Axes
  const xAxis = d3.axisBottom(x).ticks(5);
  svg
    .append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxis)
    .selectAll("text")
    .attr("fill", "#ddd");

  const yAxis = d3.axisLeft(y).ticks(5);
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .selectAll("text")
    .attr("fill", "#ddd");

  // 8) Axis labels
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 15)
    .attr("fill", "#ddd")
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Velocity (km/s)");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("fill", "#ddd")
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .attr("transform", "rotate(-90)")
    .text("Number of Satellites");

  // 9) Title
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "14px")
    .text("Velocity Distribution");

  // 10) Tooltip
  const tooltip = d3
    .select("body")
    .append("div")
    .style("position", "absolute")
    .style("padding", "6px 8px")
    .style("background", "#333")
    .style("color", "#fff")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  bar
    .on("mouseover", function (event, d) {
      d3.select(this).select("rect").attr("fill", "#10b981"); // highlight
      tooltip
        .style("opacity", 1)
        .html(`
          <div><b>Count</b>: ${d.length}</div>
          <div>Range: ${d.x0.toFixed(2)} - ${d.x1.toFixed(2)} km/s</div>
        `);
    })
    .on("mousemove", function (event, d) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 20 + "px");
    })
    .on("mouseout", function () {
      d3.select(this).select("rect").attr("fill", "#34d399");
      tooltip.style("opacity", 0);
    });
}
