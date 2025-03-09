import * as d3 from "d3";

export default function createPerigeeApogeeScatter(satellites) {
  // 1) Clear old DOM
  const container = d3.select("#perigee-apogee-scatter");
  container.selectAll("*").remove();

  // 2) Chart dimensions
  const width = 500;
  const height = 300;
  const margin = { top: 40, right: 30, bottom: 60, left: 70 };

  // 3) Create SVG
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("background", "#1f2937");

  // 4) Prepare data
  const data = satellites
    .filter((d) => d.perigee > 0 && d.apogee > 0)
    .map((d) => ({
      perigee: +d.perigee,
      apogee: +d.apogee,
    }));

  // 5) Scales (log scale on both axes)
  const x = d3
    .scaleLog()
    .domain([1, d3.max(data, (d) => d.perigee) || 1])
    .range([margin.left, width - margin.right])
    .nice();

  const y = d3
    .scaleLog()
    .domain([1, d3.max(data, (d) => d.apogee) || 1])
    .range([height - margin.bottom, margin.top])
    .nice();

  // 6) Axes
  const xAxis = d3.axisBottom(x).ticks(5, ".2s");
  svg
    .append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxis)
    .selectAll("text")
    .attr("fill", "#ddd");

  const yAxis = d3.axisLeft(y).ticks(5, ".2s");
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .selectAll("text")
    .attr("fill", "#ddd");

  // 7) Axis labels
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", height - 15)
    .attr("fill", "#ddd")
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Perigee (km, log scale)");

  svg
    .append("text")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("fill", "#ddd")
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .attr("transform", "rotate(-90)")
    .text("Apogee (km, log scale)");

  // 8) Title
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "14px")
    .text("Perigee vs Apogee Scatter Plot");

  // 9) Plot circles
  svg
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.perigee))
    .attr("cy", (d) => y(d.apogee))
    .attr("r", 3)
    .attr("fill", "#93c5fd"); // tailwind blue-300

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

  svg
    .selectAll("circle")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("fill", "#f87171"); // highlight

      tooltip
        .style("opacity", 1)
        .html(`
          <div>Perigee: <b>${d3.format(".2s")(d.perigee)}</b> km</div>
          <div>Apogee: <b>${d3.format(".2s")(d.apogee)}</b> km</div>
        `);
    })
    .on("mousemove", function (event, d) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 20 + "px");
    })
    .on("mouseout", function () {
      d3.select(this).attr("fill", "#93c5fd");
      tooltip.style("opacity", 0);
    });
}
