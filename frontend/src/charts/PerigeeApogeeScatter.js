import * as d3 from "d3";

export default function createPerigeeApogeeScatter(satellites) {
  // 1) Clear old DOM
  const container = d3.select("#perigee-apogee-scatter");
  container.selectAll("*").remove();

  // 2) Chart dimensions
  const width = 500;
  const height = 350;
  const margin = { top: 50, right: 40, bottom: 70, left: 80 };

  // 3) Create SVG
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("background", "#10171E") // Mako Theme Dark Background
    .style("border-radius", "8px");

  // 4) Prepare data (Filter & Find Dense Region)
  const data = satellites
    .filter((d) => d.perigee > 0 && d.apogee > 0)
    .map((d) => ({
      norad: d.norad_number,
      perigee: +d.perigee,
      apogee: +d.apogee,
    }));

  // Sort perigee and apogee values
  const perigeeSorted = data.map((d) => d.perigee).sort((a, b) => a - b);
  const apogeeSorted = data.map((d) => d.apogee).sort((a, b) => a - b);

  // **TIGHTEN ZOOM TO REMOVE EMPTY SPACE**
  const minPerigee = perigeeSorted[Math.floor(perigeeSorted.length * 0.1)] || 150;
  const maxPerigee = perigeeSorted[Math.floor(perigeeSorted.length * 0.98)] || 600;

  const minApogee = apogeeSorted[Math.floor(apogeeSorted.length * 0.1)] || 200;
  const maxApogee = apogeeSorted[Math.floor(apogeeSorted.length * 0.98)] || 700;

  // 5) Scales (Zoomed in on densest region)
  const x = d3
    .scaleLog()
    .domain([minPerigee, maxPerigee])
    .range([margin.left, width - margin.right])
    .nice();

  const y = d3
    .scaleLog()
    .domain([minApogee, maxApogee])
    .range([height - margin.bottom, margin.top])
    .nice();

  // 6) Axes
  const xAxis = d3.axisBottom(x).ticks(6, ".2s");
  svg
    .append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxis)
    .selectAll("text")
    .attr("fill", "#aaa")
    .style("font-size", "12px");

  const yAxis = d3.axisLeft(y).ticks(6, ".2s");
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .selectAll("text")
    .attr("fill", "#aaa")
    .style("font-size", "12px");

  // 7) Axis labels
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 30)
    .attr("fill", "#ddd")
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .text("Perigee Altitude (km, Log Scale)");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("fill", "#ddd")
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .attr("transform", "rotate(-90)")
    .text("Apogee Altitude (km, Log Scale)");

  // 8) Title
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text("Satellite Perigee vs Apogee Distribution");

  // 9) Plot circles (Zoomed in on Clustering)
  const circles = svg
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.perigee))
    .attr("cy", (d) => y(d.apogee))
    .attr("r", 4)
    .attr("fill", "#3b82f6") // Bright Blue
    .attr("opacity", 0.9)
    .style("stroke", "#fff")
    .style("stroke-width", 0.5);

  // 10) Tooltip (Hover to see NORAD)
  const tooltip = d3
    .select("body")
    .append("div")
    .style("position", "absolute")
    .style("padding", "8px 12px")
    .style("background", "#222")
    .style("color", "#fff")
    .style("border-radius", "6px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  circles
    .on("mouseover", function (event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6)
        .attr("fill", "#f87171"); // Highlight Red

      tooltip
        .style("opacity", 1)
        .html(`
          <div><strong>NORAD:</strong> ${d.norad}</div>
          <div><strong>Perigee:</strong> ${d3.format(".2s")(d.perigee)} km</div>
          <div><strong>Apogee:</strong> ${d3.format(".2s")(d.apogee)} km</div>
        `);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 20 + "px");
    })
    .on("mouseout", function () {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 4)
        .attr("fill", "#3b82f6");

      tooltip.style("opacity", 0);
    });

  return svg.node();
}
