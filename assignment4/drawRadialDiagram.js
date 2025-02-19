(function () {
  // The main drawing function now accepts three parameters:
  // containerSelector: the container in which to draw the diagram
  // jsonFile: the path to the JSON file to load
  // order: either "alphabetical" or "occurrences"
  function drawRadialDiagram(containerSelector, jsonFile = "json/starwars-full-interactions-allCharacters.json", order = "alphabetical") {
    // Remove any existing SVG in the container.
    const container = d3.select(containerSelector);
    container.select("svg").remove();

    // Create a local tooltip specific to this container.
    let localTooltip = container.select(".tooltip");
    if (localTooltip.empty()) {
      localTooltip = container
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

    // ─── DIMENSIONS, SVG, & CLUSTER LAYOUT ─────────────────────────
    const width = 600,
      height = 700,
      radius = width/1.75,
      k = 6; // number of segments used for edge bundling

    // Create an SVG element inside the container.
    const svg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const cluster = d3.cluster().size([360, radius - 150]);

    // ─── RADIAL LINE GENERATOR WITH BUNDLING CURVE ───────────────────────────────
    const line = d3
      .lineRadial()
      .curve(d3.curveBundle.beta(0.85))
      .angle((d) => d.x * (Math.PI / 180))
      .radius((d) => d.y);

    // ─── CUSTOM PATH, LINE, & BEZIERCURVE CLASSES ───────────────────────────────
    class Path {
      constructor() {
        this._ = [];
        this._m = undefined;
      }
      moveTo(x, y) {
        this._ = [];
        this._m = [x, y];
      }
      lineTo(x, y) {
        this._.push(new Line(this._m, (this._m = [x, y])));
      }
      bezierCurveTo(ax, ay, bx, by, x, y) {
        this._.push(
          new BezierCurve(this._m, [ax, ay], [bx, by], (this._m = [x, y]))
        );
      }
      *split(k = 0) {
        const n = this._.length;
        const i = Math.floor(n / 2);
        const j = Math.ceil(n / 2);
        const a = new Path();
        a._ = this._.slice(0, i);
        const b = new Path();
        b._ = this._.slice(j);
        if (i !== j) {
          const [ab, ba] = this._[i].split();
          a._.push(ab);
          b._.unshift(ba);
        }
        if (k > 1) {
          yield* a.split(k - 1);
          yield* b.split(k - 1);
        } else {
          yield a;
          yield b;
        }
      }
      toString() {
        return this._.join("");
      }
    }

    class Line {
      constructor(a, b) {
        this.a = a;
        this.b = b;
      }
      split() {
        const { a, b } = this;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return [new Line(a, m), new Line(m, b)];
      }
      toString() {
        return `M${this.a}L${this.b}`;
      }
    }

    const BezierCurve = (() => {
      const l1 = [4 / 8, 4 / 8, 0 / 8, 0 / 8];
      const l2 = [2 / 8, 4 / 8, 2 / 8, 0 / 8];
      const l3 = [1 / 8, 3 / 8, 3 / 8, 1 / 8];
      const r1 = [0 / 8, 2 / 8, 4 / 8, 2 / 8];
      const r2 = [0 / 8, 0 / 8, 4 / 8, 4 / 8];

      function dot([ka, kb, kc, kd], { a, b, c, d }) {
        return [
          ka * a[0] + kb * b[0] + kc * c[0] + kd * d[0],
          ka * a[1] + kb * b[1] + kc * c[1] + kd * d[1],
        ];
      }

      return class BezierCurve {
        constructor(a, b, c, d) {
          this.a = a;
          this.b = b;
          this.c = c;
          this.d = d;
        }
        split() {
          const m = dot(l3, this);
          return [
            new BezierCurve(this.a, dot(l1, this), dot(l2, this), m),
            new BezierCurve(m, dot(r1, this), dot(r2, this), this.d),
          ];
        }
        toString() {
          return `M${this.a}C${this.b},${this.c},${this.d}`;
        }
      };
    })();

    // ─── HELPER: ID FUNCTION ──────────────────────────────────────────────────────
    function id(node) {
      return node.parent && node.parent.data.name
        ? id(node.parent) + "." + node.data.name
        : node.data.name;
    }

    // ─── BUNDLED PATH GENERATOR ───────────────────────────────────────────────────
    const bundledPath = ([source, target]) => {
      const p = new Path();
      line.context(p)(source.path(target));
      return p;
    };

    // ─── MAIN DRAW FUNCTION WITH UNDIRECTED INTERACTIONS ─────────────────────────
    fetch(jsonFile)
      .then((response) => response.json())
      .then((data) => {
        // Pre-calculate occurrence counts for each node.
        data.nodes.forEach((d) => (d.count = 0));
        data.links.forEach((link) => {
          data.nodes[link.source].count += 1;
          data.nodes[link.target].count += 1;
        });

        // Build a dummy root so that each node becomes a child,
        // and sort the children based on the chosen ordering.
        const root = d3
          .hierarchy({ name: "", children: data.nodes })
          .sum((d) => d.value)
          .sort((a, b) => {
            if (order === "alphabetical") {
              return d3.ascending(a.data.name, b.data.name);
            } else if (order === "occurrences") {
              return d3.descending(a.data.count, b.data.count) || d3.ascending(a.data.name, b.data.name);
            }
            return 0;
          });

        // Compute the cluster layout.
        cluster(root);

        // Build a mapping from node name to the corresponding leaf node.
        const nameToNode = new Map(root.leaves().map((d) => [d.data.name, d]));

        // Build a unique, undirected edge for each link.
        const edgesMap = new Map();
        data.links.forEach((link) => {
          const sourceName = data.nodes[link.source].name;
          const targetName = data.nodes[link.target].name;
          const key =
            sourceName < targetName
              ? `${sourceName}-${targetName}`
              : `${targetName}-${sourceName}`;
          if (!edgesMap.has(key)) {
            const source = nameToNode.get(sourceName);
            const target = nameToNode.get(targetName);
            if (source && target) {
              edgesMap.set(key, {
                source,
                target,
                path: bundledPath([source, target]),
                value: link.value || 1,
              });
            }
          } else {
            const e = edgesMap.get(key);
            e.value += link.value || 1;
          }
        });
        const edges = Array.from(edgesMap.values());

        // Compute an interaction count for each node (if not already computed).
        root.leaves().forEach((node) => {
          node.data.value = edges.filter(
            (e) => e.source === node || e.target === node
          ).length;
        });

        // Separate edges into two groups.
        const customEdges = edges.filter(
          (e) => e.source.data.colour !== "#808080"
        );
        const defaultEdges = edges.filter(
          (e) => e.source.data.colour === "#808080"
        );

        // Draw custom edges.
        svg
          .append("g")
          .attr("fill", "none")
          .selectAll("path.custom")
          .data(customEdges)
          .enter()
          .append("path")
          .attr("class", "custom edge")
          .attr("d", (d) => d.path.toString())
          .style("stroke", (d) => d.source.data.colour)
          .attr("data-original-stroke", (d) => d.source.data.colour);

        // Draw default edges.
        const defaultEdgesData = defaultEdges.map((edge) => {
          return {
            segments: Array.from(edge.path.split(k)),
            edge: edge, // store the original edge object
          };
        });

        svg
          .append("g")
          .attr("fill", "none")
          .selectAll("path.default")
          .data(defaultEdgesData)
          .join("path")
          .attr("class", "default edge")
          .style("mix-blend-mode", "darken")
          .attr("stroke", "#ccc")
          .attr("data-original-stroke", "#ccc")
          .attr("d", (d) => d.segments.join(""));

        // ─── DRAW THE NODES AND ADD LABELS ───────────────────────────────────────
        const node = svg
          .append("g")
          .selectAll("g")
          .data(root.leaves())
          .join("g")
          .attr("transform", (d) => `rotate(${d.x - 90}) translate(${d.y},0)`);

        node
          .append("circle")
          .attr("r", 4)
          .style("fill", (d) => d.data.colour);

        // Make the labels smaller by setting a reduced font size.
        node
          .append("text")
          .attr("dy", ".31em")
          .style("font-size", "8px")
          .style("font-weight", "bold")
          .style("fill", (d) => d.data.colour)
          .attr("x", (d) => (d.x < 180 ? 6 : -6))
          .attr("text-anchor", (d) => (d.x < 180 ? "start" : "end"))
          .attr("transform", (d) => (d.x < 180 ? null : "rotate(180)"))
          .text((d) => d.data.name);

        // ─── NODE HOVER INTERACTIVITY & TOOLTIP ─────────────────────────────
        node
          .on("pointerenter", function (event, d) {
            const hoveredColor = d.data.colour === "#808080" ? "red" : d.data.colour;
            const hoveredID = id(d);
            svg.selectAll("path.edge")
              .style("opacity", function (dd) {
                const e = dd.edge ? dd.edge : dd;
                return id(e.source) === hoveredID || id(e.target) === hoveredID
                  ? 1
                  : 0.01;
              })
              .style("stroke", function (dd) {
                const e = dd.edge ? dd.edge : dd;
                return id(e.source) === hoveredID || id(e.target) === hoveredID
                  ? hoveredColor
                  : "#ccc";
              });
            localTooltip
              .html(
                `${d.data.name}<br>Number of scenes appeared in: ${d.data.value}`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px")
              .transition()
              .duration(200)
              .style("opacity", 0.9);
          })
          .on("pointermove", function (event) {
            localTooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px");
          })
          .on("pointerleave", function () {
            svg.selectAll("path.edge")
              .style("opacity", 1)
              .style("stroke", function (dd) {
                const e = dd.edge ? dd.edge : dd;
                return d3.select(this).attr("data-original-stroke");
              });
            localTooltip.transition().duration(200).style("opacity", 0);
          });

        // ─── EDGE HOVER INTERACTIVITY: FADE OTHER EDGES & TOOLTIP ─────────────
        svg.selectAll("path.edge")
          .on("pointerenter", function (event, d) {
            svg.selectAll("path.edge")
              .filter(function () {
                return this !== event.currentTarget;
              })
              .transition()
              .duration(200)
              .style("opacity", 0.01);
            d3.select(event.currentTarget)
              .transition()
              .duration(200)
              .style("opacity", 1);
            const e = d.edge ? d.edge : d;
            localTooltip
              .html(
                `Source: ${e.source.data.name}<br>
                 Target: ${e.target.data.name}<br>
                 Number of scenes together: ${e.value || "N/A"}`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px")
              .transition()
              .duration(200)
              .style("opacity", 0.9);
          })
          .on("pointermove", function (event) {
            localTooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px");
          })
          .on("pointerleave", function () {
            svg.selectAll("path.edge")
              .transition()
              .duration(200)
              .style("opacity", 1)
              .style("stroke", function (dd) {
                const e = dd.edge ? dd.edge : dd;
                return d3.select(this).attr("data-original-stroke");
              });
            localTooltip.transition().duration(200).style("opacity", 0);
          });
      })
      .catch((error) =>
        console.error("Failed to fetch data (or process diagram):", error)
      );
  }

  // Expose the function globally.
  window.drawRadialDiagram = drawRadialDiagram;

  // ─── INITIAL DRAWING & EVENT LISTENERS FOR DROPDOWNS & RADIO BUTTONS ─────────
  // Episode selectors for each view.
  const sel1 = document.getElementById("episode-selector1");
  const sel2 = document.getElementById("episode-selector2");

  // Get the current ordering from each view's radio buttons.
  const getOrder = (name) => {
    return document.querySelector(`input[name="${name}"]:checked`).value;
  };

  // Initial drawing.
  drawRadialDiagram("#network", sel1.value, getOrder("order1"));
  drawRadialDiagram("#arc", sel2.value, getOrder("order2"));

  // When the episode selection changes, redraw the corresponding diagram
  sel1.addEventListener("change", function () {
    drawRadialDiagram("#network", this.value, getOrder("order1"));
  });
  sel2.addEventListener("change", function () {
    drawRadialDiagram("#arc", this.value, getOrder("order2"));
  });

  // Add event listeners for the ordering radio buttons in each view.
  const order1Radios = document.querySelectorAll('input[name="order1"]');
  order1Radios.forEach(radio => {
    radio.addEventListener("change", function () {
      drawRadialDiagram("#network", sel1.value, getOrder("order1"));
    });
  });

  const order2Radios = document.querySelectorAll('input[name="order2"]');
  order2Radios.forEach(radio => {
    radio.addEventListener("change", function () {
      drawRadialDiagram("#arc", sel2.value, getOrder("order2"));
    });
  });
})();
