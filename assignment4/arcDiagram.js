//store the current chart and ordering
let current_chart = null;
let current_order = null;

// Create a tooltip div once (if it doesn't already exist)
let tooltip = d3.select("body").select(".tooltip");
if (tooltip.empty()) {
    tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "#fff")
        .style("padding", "5px")
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px")
        .style("pointer-events", "none")
        .style("opacity", 0);
}

function drawArcDiagram(nodes, links, orders) {

    //define svg dimensions 
    const width = 700;
    const step = 14;
    const marginTop = 20;
    const marginRight = 20;
    const marginBottom = 20;
    const marginLeft = 130;
    const height = ((nodes.length - 1) * step + marginTop + marginBottom) * 1.5;
    
    //position nodes on y-axis and print names
    const y = d3.scalePoint(orders.get("alphabetical"), [marginTop, height - marginBottom]);

    //use node colors if they exist 
    const getColor = d => d.colour || "#aaa";

    //create a lookup for node colors
    const colors = new Map(nodes.map(d => [d.id, d.colour]));

    //if nodes share color, use it; otherwise, fall back to a default.
    function sameColor({ source, target }) {
        return colors.get(source) === colors.get(target) ? colors.get(source) : "#aaa";
    }

    // function sameColor({ source, target }) {
    //     return colors.get(source) === colors.get(target)
    //         ? "#aaa"          //if same, use a neutral gray
    //         : colors.get(source);  //otherwise, use the source node's color
    // }

    //create svg
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .attr("style", "max-width: 100%; height: auto;");

    //make a map of node positions in the y-direction 
    const Y = new Map(nodes.map(({ id }) => [id, y(id)]));

    //function to draw arcs defining target, source and arc bend
    function arc(d) {
        const y1 = Y.get(d.source);
        const y2 = Y.get(d.target);
        const r = Math.abs(y2 - y1) / 2;
        return `M${marginLeft},${y1}A${r},${r} 0,0,${y1 < y2 ? 1 : 0} ${marginLeft},${y2}`;
    }

    //draw the arc lines
    const path = svg.insert("g", "*")
        .attr("fill", "none")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", 3)
        .selectAll("path")
        .data(links)
        .join("path")
        .attr("stroke", d => sameColor(d))
        .attr("d", arc);

    //print the name labels and circles for the nodes 
    const label = svg.append("g")
        .attr("font-family", "sans-serif")
        .attr("font-size", 14)
        .attr("text-anchor", "end")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("transform", d => `translate(${marginLeft},${Y.get(d.id)})`)
        .call(g => g.append("text")
            .attr("x", -6)
            .attr("dy", "0.35em")
            .attr("fill", d => d3.lab(getColor(d)).darker(2))
            .text(d => d.id))
        .call(g => g.append("circle")
            .attr("r", 6)
            .attr("fill", d => getColor(d)));

    //define the hover rectangle to keep track of mouse position in relation to nodes 
    label.append("rect")
        .attr("fill", "none")
        .attr("width", marginLeft + 2)
        .attr("height", step)
        .attr("x", -marginLeft)
        .attr("y", -step / 2)
        .attr("pointer-events", "all")
        .on("pointerenter", (event, d) => {
            svg.classed("hover", true);
            label.classed("primary", n => n === d);
            label.classed("secondary", n => links.some(({ source, target }) => (
                (n.id === source && d.id == target) ||
                (n.id === target && d.id === source)
            )));
            path.classed("primary", l => l.source === d.id || l.target === d.id)
                .filter(".primary")
                .raise();

            //show the tooltip with node info
            tooltip.html(`<strong>${d.id}</strong><br>Occurrences: ${d.value}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px")
                .transition()
                .duration(200)
                .style("opacity", 0.9);
        })
        .on("pointermove", (event, d) => {
            //update tooltip position
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("pointerout", (event, d) => {
            svg.classed("hover", false);
            label.classed("primary", false);
            label.classed("secondary", false);
            path.classed("primary", false).order();

            tooltip.transition()
                .duration(200)
                .style("opacity", 0);
        
        });

    //on hover, change stroke and text colour
    svg.append("style").text(`
      .hover text { fill: #aaa; }
      .hover g.primary text { font-weight: bold; fill: #242424; }
      .hover g.secondary text { fill: #242424; }
      .hover path { stroke: #ccc; }
      .hover path.primary { stroke: #242424; }
    `);

    function update(order) {
        y.domain(order);
        label
            .sort((a, b) => d3.ascending(Y.get(a.id), Y.get(b.id)))
            .transition()
            .duration(750)
            .delay((d, i) => i * 20)
            .attrTween("transform", d => {
                const i = d3.interpolateNumber(Y.get(d.id), y(d.id));
                return t => {
                    const yPos = i(t);
                    Y.set(d.id, yPos);
                    return `translate(${marginLeft},${yPos})`;
                };
            });

        path.transition()
            .duration(750 + nodes.length * 20)
            .attrTween("d", d => () => arc(d));
    }

    return Object.assign(svg.node(), { update });
}


//load the json file connected to the user selection
function loadEpisode(jsonFile) {
    d3.json(jsonFile).then(data => {
        // Map nodes: use "name" as the id, keep the value and color.
        const nodes = data.nodes.map(d => ({
            id: d.name,
            value: d.value,
            colour: d.colour
        }));
        // Convert link indices to use node ids.
        const links = data.links.map(d => ({
            source: nodes[d.source].id,
            target: nodes[d.target].id,
            value: d.value
        }));

        // Compute two orderings:
        const alphabetical = nodes.map(d => d.id).sort(d3.ascending);
        const occurrences = nodes
            .slice()
            .sort((a, b) => d3.descending(a.value, b.value) || d3.ascending(a.id, b.id))
            .map(d => d.id);

        const orders = new Map([
            ["alphabetical", alphabetical],
            ["occurrences", occurrences]
        ]);

        // Store orders globally for use by the radio button event handlers.
        current_order = orders;

        // Remove any previous chart.
        d3.select("#arc").selectAll("*").remove();
        // Render the new chart and store its reference.
        current_chart = drawArcDiagram(nodes, links, orders);
        d3.select("#arc").append(() => current_chart);
    });
}

//get dropdown element selection
const episodeSelector = document.getElementById("episode-selector");

//load episode 1 as default 
loadEpisode(episodeSelector.value);

//listen for selection change
episodeSelector.addEventListener("change", function () {
    loadEpisode(this.value);
});

//listen for radio button change
Array.from(document.getElementsByName("order")).forEach(radio => {
    radio.addEventListener("change", function () {
        if (this.checked && current_chart && current_order) {
            //retrieve new order 
            const order = current_order.get(this.value);
            current_chart.update(order);
        }
    });
});