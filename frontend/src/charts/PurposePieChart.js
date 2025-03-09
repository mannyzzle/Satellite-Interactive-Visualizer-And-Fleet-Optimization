import * as d3 from "d3";

export default function createPurposePieChart(satellites) {
  // 1) Clear old DOM
  const container = d3.select("#purpose-pie");
  container.selectAll("*").remove();

  // 2) Dimensions
  const width = 400;
  const height = 300;
  const margin = 10;
  const radius = Math.min(width, height) / 2 - margin;

  // 3) SVG
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("background", "#1f2937");

  // 4) Group
  const g = svg
    .append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  // 5) Count by purpose
  const purposeCounts = d3
    .rollups(satellites, (v) => v.length, (d) => d.purpose || "Unknown")
    .sort((a, b) => b[1] - a[1]);

  // 6) Pie generator
  const pie = d3
    .pie()
    .value((d) => d[1]);
  const data = pie(purposeCounts);

  // 7) Arc
  const arc = d3
    .arc()
    .innerRadius(0)
    .outerRadius(radius);

  // 8) Color scale
  const color = d3.scaleOrdinal(d3.schemeTableau10);

  // 9) Draw arcs
  g.selectAll("path")
    .data(data)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data[0]))
    .attr("stroke", "#fff")
    .style("stroke-width", "1px");

  // 10) Arc for label positions (outside labels)
  const outerArc = d3
    .arc()
    .innerRadius(radius * 0.7)
    .outerRadius(radius * 0.7);

  function midAngle(d) {
    return d.startAngle + (d.endAngle - d.startAngle) / 2;
  }

  // 11) Slice labels (outside)
  g.selectAll(".pie-label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "pie-label")
    .attr("transform", (d) => `translate(${outerArc.centroid(d)})`)
    .attr("text-anchor", (d) => (midAngle(d) < Math.PI ? "start" : "end"))
    .attr("fill", "#ddd")
    .style("font-size", "10px")
    .text((d) => d.data[0]);

  // 12) Title
  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .style("font-size", "14px")
    .text("Satellite Purpose Breakdown");

  // 13) Tooltip
  const tooltip = d3
    .select("body")
    .append("div")
    .style("position", "absolute")
    .style("background", "#444")
    .style("color", "#fff")
    .style("padding", "5px 10px")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  g.selectAll("path")
    .on("mouseover", function (event, d) {
      d3.select(this).style("stroke-width", "2px");

      const purpose = d.data[0];
      const count = d.data[1];
      const total = d3.sum(purposeCounts.map((p) => p[1]));
      const percent = ((count / total) * 100).toFixed(1);

      tooltip
        .style("opacity", 1)
        .html(`
          <div><b>${purpose}</b></div>
          <div>Count: ${count}</div>
          <div>(${percent}%)</div>
        `);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 20 + "px");
    })
    .on("mouseout", function () {
      d3.select(this).style("stroke-width", "1px");
      tooltip.style("opacity", 0);
    });
}
