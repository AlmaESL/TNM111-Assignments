(function () {
  /**
   * Draws a radial diagram with undirected interactions from a JSON file.
   *
   * @param {string} containerSelector - The container in which to draw the diagram.
   * @param {string} [jsonFile="json/starwars-full-interactions-allCharacters.json"] - The path to the JSON file to load.
   * @param {"alphabetical"|"occurrences"} [order="alphabetical"] - The order in which to arrange the nodes.
   * @param {number[]} [letterRange=[0,25]] - Two-element array with min and max indices (0 = A, 25 = Z) for allowed starting letters.
   */
  function drawRadialDiagram(
    containerSelector,
    jsonFile = "json/starwars-full-interactions-allCharacters.json",
    order = "alphabetical",
    letterRange = [0, 25]
  ) {
    const container = d3.select(containerSelector);

    // ─── SAVE OLD POSITIONS FOR TRANSITIONS ───────────────────────────────
    let oldPositions = {};
    let oldCustomEdgePaths = {};
    let oldDefaultEdgePaths = {};

    const oldSvg = container.select("svg");
    if (!oldSvg.empty()) {
      // Save node positions (each node has class "node")
      oldSvg.selectAll("g.node").each(function (d) {
        oldPositions[d.data.name] = d3.select(this).attr("transform");
      });
      // Save custom edge paths.
      oldSvg.selectAll("path.custom.edge").each(function (d) {
        const sourceName = d.source.data.name;
        const targetName = d.target.data.name;
        const key =
          sourceName < targetName
            ? `${sourceName}-${targetName}`
            : `${targetName}-${sourceName}`;
        oldCustomEdgePaths[key] = d3.select(this).attr("d");
      });
      // Save default edge paths.
      oldSvg.selectAll("path.default.edge").each(function (d) {
        const sourceName = d.edge.source.data.name;
        const targetName = d.edge.target.data.name;
        const key =
          sourceName < targetName
            ? `${sourceName}-${targetName}`
            : `${targetName}-${sourceName}`;
        oldDefaultEdgePaths[key] = d3.select(this).attr("d");
      });
    }
    container.select("svg").remove();

    // ─── DIMENSIONS, SVG, & CLUSTER LAYOUT ───────────────────────────────
    const width = 600,
      height = 700,
      radius = width / 1.75,
      k = 6; // number of segments used for edge bundling

    // Create outer SVG and then a group translated to the center.
    const outerSvg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    const svg = outerSvg
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

    // Create (or select) a tooltip for this container.
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

    // For pinning nodes and edges via click.
    let pinnedNodeId = null;
    let pinnedEdgeKey = null;

    let nodeSelection; // declare in outer scope

    // ─── MAIN DRAW FUNCTION WITH UNDIRECTED INTERACTIONS ─────────────────────────
    fetch(jsonFile)
      .then((response) => response.json())
      .then((data) => {
        // *** FILTER THE DATA BASED ON THE LETTER RANGE ***
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        const allowedIndices = new Set();
        data.nodes.forEach((d, i) => {
          const letter = d.name.charAt(0).toUpperCase();
          const idx = alphabet.indexOf(letter);
          if (idx >= letterRange[0] && idx <= letterRange[1]) {
            allowedIndices.add(i);
          }
        });
        // Filter nodes.
        const allowedNodes = data.nodes.filter((d, i) => allowedIndices.has(i));

        // If no characters are in the selected range, display a message and return.
        if (allowedNodes.length === 0) {
          outerSvg
            .append("text")
            .attr("x", 10)
            .attr("y", 70)
            .attr("fill", "#333")
            .style("font-size", "15px")
            .text("No characters for selected range");
          return;
        }

        // Build mapping from original node index to new index.
        const indexMap = {};
        allowedNodes.forEach((d, newIdx) => {
          const origIdx = data.nodes.findIndex((n) => n.name === d.name);
          indexMap[origIdx] = newIdx;
        });
        // Filter and remap links: keep only links where both endpoints are allowed.
        const allowedLinks = data.links.filter(
          (link) =>
            allowedIndices.has(link.source) && allowedIndices.has(link.target)
        );
        allowedLinks.forEach((link) => {
          link.source = indexMap[link.source];
          link.target = indexMap[link.target];
        });
        data.nodes = allowedNodes;
        data.links = allowedLinks;
        // *** END FILTERING ***

        // Build a dummy root so that each node becomes a child.
        const root = d3
          .hierarchy({ name: "", children: data.nodes })
          .sum((d) => d.value)
          .sort((a, b) => {
            if (order === "alphabetical") {
              return d3.ascending(a.data.name, b.data.name);
            } else if (order === "occurrences") {
              return (
                d3.descending(a.data.value, b.data.value) ||
                d3.ascending(a.data.name, b.data.name)
              );
            }
            return 0;
          });

        // Compute the cluster layout.
        cluster(root);

        // Build a mapping from node name to its leaf.
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
                value: link.value,
              });
            }
          } else {
            const e = edgesMap.get(key);
            e.value += link.value;
          }
        });
        const edges = Array.from(edgesMap.values());

        // Separate edges into custom (non-gray) and default (gray) groups.
        const customEdges = edges.filter(
          (e) => e.source.data.colour !== "#808080"
        );
        const defaultEdges = edges.filter(
          (e) => e.source.data.colour === "#808080"
        );

        // ─── DRAW CUSTOM EDGES WITH TRANSITIONS ─────────────────────────────
        const customEdgeSelection = svg
          .append("g")
          .attr("fill", "none")
          .selectAll("path.custom.edge")
          .data(customEdges, (d) => {
            const sourceName = d.source.data.name;
            const targetName = d.target.data.name;
            return sourceName < targetName
              ? `${sourceName}-${targetName}`
              : `${targetName}-${sourceName}`;
          })
          .join("path")
          .attr("class", "custom edge")
          .style("stroke", (d) => d.source.data.colour)
          .attr("data-original-stroke", (d) => d.source.data.colour)
          .attr("stroke-width", 2)
          .attr("d", (d) => {
            const sourceName = d.source.data.name;
            const targetName = d.target.data.name;
            const key =
              sourceName < targetName
                ? `${sourceName}-${targetName}`
                : `${targetName}-${sourceName}`;
            return oldCustomEdgePaths[key] || d.path.toString();
          });

        customEdgeSelection
          .transition()
          .duration(750)
          .attr("d", (d) => d.path.toString());

        // ─── DRAW DEFAULT EDGES WITH TRANSITIONS ────────────────────────────
        const defaultEdgesData = defaultEdges.map((edge) => {
          return {
            segments: Array.from(edge.path.split(k)),
            edge: edge,
          };
        });

        const defaultEdgeSelection = svg
          .append("g")
          .attr("fill", "none")
          .selectAll("path.default.edge")
          .data(defaultEdgesData, (d) => {
            const sourceName = d.edge.source.data.name;
            const targetName = d.edge.target.data.name;
            return sourceName < targetName
              ? `${sourceName}-${targetName}`
              : `${targetName}-${sourceName}`;
          })
          .join("path")
          .attr("class", "default edge")
          .style("mix-blend-mode", "darken")
          .attr("stroke", "#ccc")
          .attr("data-original-stroke", "#ccc")
          .attr("stroke-width", 2)
          .attr("d", (d) => {
            const sourceName = d.edge.source.data.name;
            const targetName = d.edge.target.data.name;
            const key =
              sourceName < targetName
                ? `${sourceName}-${targetName}`
                : `${targetName}-${sourceName}`;
            return oldDefaultEdgePaths[key] || d.segments.join("");
          });

        defaultEdgeSelection
          .transition()
          .duration(750)
          .attr("d", (d) => d.segments.join(""));

        // ─── DRAW NODES AND LABELS WITH TRANSITIONS ─────────────────────────
        nodeSelection = svg
          .append("g")
          .attr("class", "nodes")
          .selectAll("g.node")
          .data(root.leaves(), (d) => d.data.name)
          .join("g")
          .attr("class", "node")
          .attr(
            "transform",
            (d) =>
              oldPositions[d.data.name] ||
              `rotate(${d.x - 90}) translate(${d.y},0)`
          );

        nodeSelection
          .append("circle")
          .attr("r", 5)
          .style("fill", (d) => d.data.colour);

        nodeSelection
          .append("text")
          .attr("dy", ".31em")
          .style("font-size", "8px")
          .style("font-weight", "bold")
          .style("fill", (d) => d.data.colour)
          .attr("x", (d) => (d.x < 180 ? 6 : -6))
          .attr("text-anchor", (d) => (d.x < 180 ? "start" : "end"))
          .attr("transform", (d) => (d.x < 180 ? null : "rotate(180)"))
          .text((d) => d.data.name);

        nodeSelection
          .transition()
          .duration(750)
          .attr("transform", (d) => `rotate(${d.x - 90}) translate(${d.y},0)`);

        // ─── NODE HOVER & PINNING (TOOLTIP) INTERACTIVITY ─────────────────
        nodeSelection
          .on("pointerenter", function (event, d) {
            if (pinnedNodeId && pinnedNodeId !== d.data.name) return;
            const hoveredColor =
              d.data.colour === "#808080" ? "red" : d.data.colour;
            const hoveredID = id(d);
            svg
              .selectAll("path.edge")
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
                `<u>${d.data.name}</u><br>Appeared in ${d.data.value} scenes`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px")
              .transition()
              .duration(200)
              .style("opacity", 0.9);
          })
          .on("pointermove", function (event, d) {
            if (pinnedNodeId && pinnedNodeId !== d.data.name) return;
            localTooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px");
          })
          .on("pointerleave", function (event, d) {
            if (pinnedNodeId === d.data.name) return;
            svg
              .selectAll("path.edge")
              .style("opacity", 1)
              .style("stroke", function () {
                return d3.select(this).attr("data-original-stroke");
              });
            localTooltip.transition().duration(200).style("opacity", 0);
          })
          .on("click", function (event, d) {
            if (pinnedNodeId === d.data.name) {
              pinnedNodeId = null;
              localTooltip.transition().duration(200).style("opacity", 0);
            } else {
              pinnedNodeId = d.data.name;
              localTooltip
                .html(
                  `<u>${d.data.name}</u><br>Appeared in ${d.data.value} scenes`
                )
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY + 10 + "px")
                .transition()
                .duration(200)
                .style("opacity", 0.9);
            }
          });

        // ─── EDGE HOVER & PINNING (TOOLTIP) INTERACTIVITY ─────────────────
        svg
          .selectAll("path.edge")
          .on("pointerenter", function (event, d) {
            const e = d.edge ? d.edge : d;
            const edgeKey =
              e.source.data.name < e.target.data.name
                ? `${e.source.data.name}-${e.target.data.name}`
                : `${e.target.data.name}-${e.source.data.name}`;
            if (pinnedEdgeKey && pinnedEdgeKey !== edgeKey) return;
            svg
              .selectAll("path.edge")
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
            localTooltip
              .html(
                `Source: ${e.source.data.name}<br>
                 Target: ${e.target.data.name}<br>
                 Number of scenes together: ${e.value}`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px")
              .transition()
              .duration(200)
              .style("opacity", 0.9);
          })
          .on("pointermove", function (event, d) {
            const e = d.edge ? d.edge : d;
            const edgeKey =
              e.source.data.name < e.target.data.name
                ? `${e.source.data.name}-${e.target.data.name}`
                : `${e.target.data.name}-${e.source.data.name}`;
            if (pinnedEdgeKey && pinnedEdgeKey !== edgeKey) return;
            localTooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px");
          })
          .on("pointerleave", function (event, d) {
            const e = d.edge ? d.edge : d;
            const edgeKey =
              e.source.data.name < e.target.data.name
                ? `${e.source.data.name}-${e.target.data.name}`
                : `${e.target.data.name}-${e.source.data.name}`;
            // If this edge is pinned or connects to the pinned node, leave it highlighted.
            if (pinnedEdgeKey === edgeKey) return;
            if (
              pinnedNodeId &&
              (e.source.data.name === pinnedNodeId ||
                e.target.data.name === pinnedNodeId)
            ) {
              return;
            }
            // Revert styling only for this edge.
            d3.select(this)
              .transition()
              .duration(200)
              .style("opacity", 1)
              .style("stroke", d3.select(this).attr("data-original-stroke"));
            localTooltip.transition().duration(200).style("opacity", 0);
          })
          .on("click", function (event, d) {
            const e = d.edge ? d.edge : d;
            const edgeKey =
              e.source.data.name < e.target.data.name
                ? `${e.source.data.name}-${e.target.data.name}`
                : `${e.target.data.name}-${e.source.data.name}`;
            if (pinnedEdgeKey === edgeKey) {
              pinnedEdgeKey = null;
              localTooltip.transition().duration(200).style("opacity", 0);
            } else {
              pinnedEdgeKey = edgeKey;
              localTooltip
                .html(
                  `Source: ${e.source.data.name}<br>
                   Target: ${e.target.data.name}<br>
                   Number of scenes together: ${e.value}`
                )
                .style("left", event.pageX + 10 + "px")
                .style("top", event.pageY + 10 + "px")
                .transition()
                .duration(200)
                .style("opacity", 0.9);
            }
          });

        // ─── ADD BRUSHING & LINKING FUNCTIONALITY ─────────────────────────────
        // Define the brush behavior as before.
        const brush = d3
          .brush()
          .extent([
            [-width / 2, -height / 2],
            [width / 2, height / 2],
          ])
          .on("brush", brushed)
          .on("end", brushEnded);

        // Function to add the brush group.
        function addBrush() {
          // Only add the brush group if it doesn't already exist.
          if (svg.select("g.brush").empty()) {
            svg.append("g").attr("class", "brush").call(brush);
          }
        }

        // Function to remove the brush group and clear any brushed classes.
        function removeBrush() {
          svg.select("g.brush").remove();
          // Clear any brushing-related classes.
          node.classed("brushed", false);
          svg
            .selectAll("path.custom.edge, path.default.edge")
            .classed("brushed", false);
        }

        // Initially, check if brushing is enabled via the checkbox.
        const brushCheckbox = document.getElementById("enable-brush");
        if (brushCheckbox && brushCheckbox.checked) {
          addBrush();
        }

        // Attach an event listener to toggle brushing when the checkbox changes.
        if (brushCheckbox) {
          brushCheckbox.addEventListener("change", function () {
            if (this.checked) {
              addBrush();
            } else {
              removeBrush();
            }
          });
        }

        function brushed(event) {
          const selection = event.selection;
          if (!selection) return;

          // Compute brushed nodes in the current diagram
          const brushedNames = new Set();
          nodeSelection.classed("brushed", function (d) {
            // Convert polar coordinates to Cartesian coordinates.
            const angle = (d.x - 90) * (Math.PI / 180);
            const x = d.y * Math.cos(angle);
            const y = d.y * Math.sin(angle);
            const isBrushed =
              x >= selection[0][0] &&
              x <= selection[1][0] &&
              y >= selection[0][1] &&
              y <= selection[1][1];
            if (isBrushed) brushedNames.add(d.data.name);
            return isBrushed;
          });

          // Optionally, update edge styling in this diagram here...

          // Broadcast the brushed node names to all diagrams
          brushDispatcher.call("brushed", null, brushedNames);
        }

        // // ─── BRUSH EVENT HANDLERS ─────────────────────────────
        // function brushed(event) {
        //   const selection = event.selection;
        //   if (!selection) return;

        //   // Highlight nodes within the brush selection.
        //   node.classed("brushed", (d) => {
        //     // Convert polar coordinates (d.x, d.y) to Cartesian (x, y).
        //     const angle = (d.x - 90) * (Math.PI / 180);
        //     const x = d.y * Math.cos(angle);
        //     const y = d.y * Math.sin(angle);
        //     return (
        //       x >= selection[0][0] &&
        //       x <= selection[1][0] &&
        //       y >= selection[0][1] &&
        //       y <= selection[1][1]
        //     );
        //   });

        //   // Collect the names of brushed nodes.
        //   const brushedNames = new Set();
        //   node
        //     .filter(function (d) {
        //       return d3.select(this).classed("brushed");
        //     })
        //     .each((d) => brushedNames.add(d.data.name));

        //   // Highlight edges that connect two brushed nodes.
        //   // svg
        //   //   .selectAll("path.custom.edge, path.default.edge")
        //   //   .classed("brushed", (d) => {
        //   //     const sourceName = d.edge
        //   //       ? d.edge.source.data.name
        //   //       : d.source.data.name;
        //   //     const targetName = d.edge
        //   //       ? d.edge.target.data.name
        //   //       : d.target.data.name;
        //   //     return (
        //   //       brushedNames.has(sourceName) && brushedNames.has(targetName));
        //   //  });
        // }

        function brushEnded(event) {
          // If the brush selection is cleared, remove brushed classes.
          if (!event.selection) {
            nodeSelection.classed("brushed", false);
            svg
              .selectAll("path.custom.edge, path.default.edge")
              .classed("brushed", false);
          }
        }

        // ─── ADD NODE COUNT LABEL AT THE BOTTOM LEFT ─────────────────────────
        outerSvg
          .append("text")
          .attr("x", 10)
          .attr("y", 70)
          .attr("fill", "#333")
          .style("font-size", "15px")
          .text(`Characters in current selection: ${root.leaves().length}`);
      })
      .catch((error) =>
        console.error("Failed to fetch data (or process diagram):", error)
      );

    const ns = containerSelector.replace("#", "");
    brushDispatcher.on("brushed." + ns, function (brushedNames) {
      console.log("ns" + ns);
      // Update nodes in this diagram based on the global brushed set
      if (nodeSelection) {
        nodeSelection.classed("brushed", (d) => brushedNames.has(d.data.name));
      }
      // Update edges: assume each edge's data has source/target with a 'data.name'
      svg
        .selectAll("path.custom.edge, path.default.edge")
        .classed("brushed", function (d) {
          const sourceName = d.edge
            ? d.edge.source.data.name
            : d.source.data.name;
          const targetName = d.edge
            ? d.edge.target.data.name
            : d.target.data.name;
          return brushedNames.has(sourceName) || brushedNames.has(targetName);
        });
    });
  }

  // Expose the function globally.
  window.drawRadialDiagram = drawRadialDiagram;

  // Create a global dispatcher for brush events
  const brushDispatcher = d3.dispatch("brushed");

  // ─── INITIAL DRAWING & EVENT LISTENERS FOR DROPDOWNS & RADIO BUTTONS ─────────

  // Helper to get current letter range from slider.
  function getLetterRange(viewId) {
    const sliderElement = document.getElementById(`alphaRange${viewId}`);
    const sliderValues = sliderElement.noUiSlider.get(); // returns array of letters
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    return sliderValues.map((letter) => alphabet.indexOf(letter));
  }

  const sel1 = document.getElementById("episode-selector1");
  const sel2 = document.getElementById("episode-selector2");
  const getOrder = (name) =>
    document.querySelector(`input[name="${name}"]:checked`).value;

  // On initial draw use the full letter range: [0, 25]
  drawRadialDiagram("#network", sel1.value, getOrder("order1"), [0, 25]);
  drawRadialDiagram("#arc", sel2.value, getOrder("order2"), [0, 25]);

  // When episode selection changes, redraw using the current slider range.
  sel1.addEventListener("change", function () {
    drawRadialDiagram(
      "#network",
      this.value,
      getOrder("order1"),
      getLetterRange(1)
    );
  });
  sel2.addEventListener("change", function () {
    drawRadialDiagram(
      "#arc",
      this.value,
      getOrder("order2"),
      getLetterRange(2)
    );
  });

  // When ordering changes, redraw using the current slider range.
  const order1Radios = document.querySelectorAll('input[name="order1"]');
  order1Radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      drawRadialDiagram(
        "#network",
        sel1.value,
        getOrder("order1"),
        getLetterRange(1)
      );
    });
  });
  const order2Radios = document.querySelectorAll('input[name="order2"]');
  order2Radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      drawRadialDiagram(
        "#arc",
        sel2.value,
        getOrder("order2"),
        getLetterRange(2)
      );
    });
  });
})();
