// The main drawing function now accepts three parameters:
// containerSelector: the container in which to draw the diagram
// jsonFile: the path to the JSON file to load
// order: either "alphabetical" or "occurrences"
(function () {
  /**
   * Draws a radial diagram with undirected interactions from a JSON file.
   *
   * @param {string} containerSelector - The container in which to draw the diagram.
   * @param {string} [jsonFile="json/starwars-full-interactions-allCharacters.json"] - The path to the JSON file to load.
   * @param {"alphabetical"|"occurrences"} [order="alphabetical"] - The order in which to arrange the nodes.
   */
  function drawRadialDiagram(
    containerSelector,
    jsonFile = "json/starwars-full-interactions-allCharacters.json",
    order = "alphabetical"
  ) {
    // Select container in the html file in which to draw the diagram
    const container = d3.select(containerSelector);

    // ─── SAVE OLD POSITIONS FOR TRANSITIONS ───────────────────────────────
    let oldPositions = {};
    let oldCustomEdgePaths = {};
    let oldDefaultEdgePaths = {};

    const oldSvg = container.select("svg");
    if (!oldSvg.empty()) {
      // For nodes: they have been given a class "node"
      oldSvg.selectAll("g.node").each(function (d) {
        // Save the transform for each node
        oldPositions[d.data.name] = d3.select(this).attr("transform");
      });
      // For custom edges:
      oldSvg.selectAll("path.custom.edge").each(function (d) {
        // Save the path for each custom edge
        const sourceName = d.source.data.name;
        const targetName = d.target.data.name;

        const key =
          sourceName < targetName
            ? `${sourceName}-${targetName}`
            : `${targetName}-${sourceName}`;
        oldCustomEdgePaths[key] = d3.select(this).attr("d");
      });

      // For default edges:
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

    // Remove any existing SVG in the container
    container.select("svg").remove();

    // ─── DIMENSIONS, SVG, & CLUSTER LAYOUT ───────────────────────────────
    const width = 600,
      height = 700,
      radius = width / 1.75,
      k = 6; // number of segments used for edge bundling

    // Create an SVG element inside the container
    const svg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      // Center the SVG element
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Create cluster layout with specified size
    const cluster = d3.cluster().size([360, radius - 150]);

    // ─── RADIAL LINE GENERATOR WITH BUNDLING CURVE ───────────────────────────────
    const line = d3
      .lineRadial()
      // Generate radial curves with a bundle curve
      .curve(d3.curveBundle.beta(0.85))
      // Convert to radians
      .angle((d) => d.x * (Math.PI / 180))
      .radius((d) => d.y);

    // ─── CUSTOM PATH, LINE, & BEZIERCURVE CLASSES ───────────────────────────────

    // Class of line segements for links between nodes
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
      /**
       * Splits the current Path instance into two sub-paths at the midpoint.
       * If the number of sub-paths is odd, the middle segment is split and shared
       * between the two resulting sub-paths. This function can recursively split
       * the path into more sub-paths if 'k' is greater than 1, yielding each
       * sub-path generated.
       *
       * @param {number} [k=0] - The number of recursive splits to perform. A value
       *   of 0 means no additional splits, returning only the initial division.
       * @yields {Path} - Each sub-path created by splitting the original path.
       */

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
        // Check if we need to split further
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
      /**
       * Splits the current Line instance into two sub-lines at the midpoint.
       * The midpoint is calculated as the average of the start and end points.
       * This function returns an array containing the two resulting Line
       * instances, where the first spans from the start point to the midpoint,
       * and the second spans from the midpoint to the end point.
       *
       * @return {[Line, Line]} An array containing the two sub-lines created
       *   by splitting the original line at its midpoint.
       */

      split() {
        const { a, b } = this;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return [new Line(a, m), new Line(m, b)];
      }
      toString() {
        return `M${this.a}L${this.b}`;
      }
    }

    // Class of Bezier curves for links between nodes, values are control points
    const BezierCurve = (() => {
      const l1 = [4 / 8, 4 / 8, 0 / 8, 0 / 8];
      const l2 = [2 / 8, 4 / 8, 2 / 8, 0 / 8];
      const l3 = [1 / 8, 3 / 8, 3 / 8, 1 / 8];
      const r1 = [0 / 8, 2 / 8, 4 / 8, 2 / 8];
      const r2 = [0 / 8, 0 / 8, 4 / 8, 4 / 8];

      /**
       * Computes the dot product of the given control points and coefficients.
       *
       * @param {[number, number, number, number]} coefficients - Coefficients
       *   to use in the dot product.
       * @param {{a: [number, number], b: [number, number], c: [number, number], d: [number, number]}} controlPoints
       *   - Control points to use in the dot product.
       * @return {[number, number]} The computed dot product.
       */

      /**
       * Computes the dot product of the given control points and coefficients.
       *
       * @param {Array<number>} coefficients - Coefficients to use in the dot product.
       * @param {{a: Array<number>, b: Array<number>, c: Array<number>, d: Array<number>}} controlPoints -
       *   Control points to use in the dot product.
       * @return {Array<number>} The computed dot product.
       */
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

    /**
     * Computes the identifier for the given node in the tree by concatenating
     * its name with the names of its ancestors.
     *
     * @param {{parent: ?Object, data: {name: string}}} node - Node to compute
     *   the identifier for.
     * @return {string} The identifier for the given node.
     */
    function id(node) {
      return node.parent && node.parent.data.name
        ? id(node.parent) + "." + node.data.name
        : node.data.name;
    }

    // ─── BUNDLED PATH GENERATOR ───────────────────────────────────────────────────

    /**
     * Computes a bundled path for the given source and target nodes by
     * concatenating the paths from the source to the target. The path is
     * computed in the context of a new Path object, which is returned.
     *
     * @param {Array.<Object>} [source, target] - Source and target nodes to
     *   compute the path for.
     * @return {Path} The computed bundled path.
     */
    const bundledPath = ([source, target]) => {
      const p = new Path();
      line.context(p)(source.path(target));
      return p;
    };

    // ─── MAIN DRAW FUNCTION WITH UNDIRECTED INTERACTIONS ─────────────────────────
    fetch(jsonFile)
      .then((response) => response.json())
      .then((data) => {
        // Pre-calculate occurrence counts for each node
        data.nodes.forEach((d) => (d.count = 0));
        data.links.forEach((link) => {
          data.nodes[link.source].count += 1;
          data.nodes[link.target].count += 1;
        });

        // Build a dummy root so that each node becomes a child,
        // and sort the children based on the chosen ordering
        const root = d3
          .hierarchy({ name: "", children: data.nodes })
          .sum((d) => d.value)
          .sort((a, b) => {
            // Sort the nodes after the children have been added and after ordering selection
            if (order === "alphabetical") {
              return d3.ascending(a.data.name, b.data.name);
            } else if (order === "occurrences") {
              return (
                d3.descending(a.data.count, b.data.count) ||
                d3.ascending(a.data.name, b.data.name)
              );
            }
            return 0;
          });

        // Compute the cluster layout
        cluster(root);

        // Build a mapping from node name to the corresponding leaf node
        const nameToNode = new Map(root.leaves().map((d) => [d.data.name, d]));

        // Build a unique, undirected edge for each link
        const edgesMap = new Map();
        data.links.forEach((link) => {
          const sourceName = data.nodes[link.source].name;
          const targetName = data.nodes[link.target].name;

          // Ensure that the source name is always lexicographically less than the target name
          // because the edge key is based on the concatenation of the two names
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
                // Store the path for the edge, thats why we bundle the path
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

        // Compute an interaction count for each node (if not already computed)
        root.leaves().forEach((node) => {
          node.data.value = edges.filter(
            (e) => e.source === node || e.target === node
          ).length;
        });

        // Separate edges into two groups
        const customEdges = edges.filter(
          (e) => e.source.data.colour !== "#808080"
        );
        const defaultEdges = edges.filter(
          (e) => e.source.data.colour === "#808080"
        );

        // ─── DRAW CUSTOM EDGES WITH TRANSITIONS ─────────────────────────────

        // Draw custom edges with transitions
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
            edge: edge, // store the original edge object
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

        // ─── DRAW THE NODES AND ADD LABELS WITH TRANSITIONS ───────────────────
        const node = svg
          .append("g")
          .attr("class", "nodes")
          .selectAll("g.node")
          .data(root.leaves(), (d) => d.data.name)
          .join("g")
          .attr("class", "node")
          .attr("transform", (d) => {
            // If there’s an old position for this node, start there
            return (
              oldPositions[d.data.name] ||
              `rotate(${d.x - 90}) translate(${d.y},0)`
            );
          });

        node
          .append("circle")
          .attr("r", 4)
          .style("fill", (d) => d.data.colour);

        node
          .append("text")
          .attr("dy", ".31em")
          .style("font-size", "8px")
          .style("font-weight", "bold")
          .style("fill", (d) => d.data.colour)
          // Position the text outside the circle
          .attr("x", (d) => (d.x < 180 ? 6 : -6))
          .attr("text-anchor", (d) => (d.x < 180 ? "start" : "end"))
          .attr("transform", (d) => (d.x < 180 ? null : "rotate(180)"))
          .text((d) => d.data.name);

        // Transition nodes to their new positions
        node
          .transition()
          .duration(750)
          .attr("transform", (d) => `rotate(${d.x - 90}) translate(${d.y},0)`);
        // For pinning nodes and edges via click.
        let pinnedNodeId = null;
        let pinnedEdgeKey = null;
        // ─── NODE HOVER INTERACTIVITY & TOOLTIP ─────────────────────────────
        // Create a local tooltip specific to this container
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

        node
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
                `${d.data.name}<br>Number of scenes appeared in: ${d.data.value}`
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px")
              .transition()
              .duration(200)
              .style("opacity", 0.9);
          })
          .on("pointermove", function (event) {
            if (pinnedNodeId && pinnedNodeId !== d.data.name) return;
            localTooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px");
          })
          .on("pointerleave", function () {
            if (pinnedNodeId === d.data.name) return;
            svg
              .selectAll("path.edge")
              .style("opacity", 1)
              .style("stroke", function (dd) {
                const e = dd.edge ? dd.edge : dd;
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

        // … after the node transition (after node.transition().duration(750)...)

        // ─── ADD BRUSHING & LINKING FUNCTIONALITY ─────────────────────────────
        const brush = d3
          .brush()
          // Define the brush extent relative to the centered coordinate system:
          .extent([
            [-width / 2, -height / 2],
            [width / 2, height / 2],
          ])
          .on("brush", brushed)
          .on("end", brushEnded);

        svg.append("g").attr("class", "brush").call(brush);

        function brushed(event) {
          const selection = event.selection;
          if (!selection) return;

          // Highlight nodes within the brush selection.
          // Compute each node's (x,y) from its polar coordinates.
          node.classed("brushed", (d) => {
            const angle = (d.x - 90) * (Math.PI / 180);
            const x = d.y * Math.cos(angle);
            const y = d.y * Math.sin(angle);
            return (
              x >= selection[0][0] &&
              x <= selection[1][0] &&
              y >= selection[0][1] &&
              y <= selection[1][1]
            );
          });

          // Get the names of all nodes that are currently brushed.
          const brushedNames = new Set();
          node
            .filter(function (d) {
              return d3.select(this).classed("brushed");
            })
            .each((d) => brushedNames.add(d.data.name));

          // Highlight edges connecting two brushed nodes.
          svg
            .selectAll("path.custom.edge, path.default.edge")
            .classed("brushed", (d) => {
              // Handle both edge objects that are stored directly or wrapped inside d.edge.
              const sourceName = d.edge
                ? d.edge.source.data.name
                : d.source.data.name;
              const targetName = d.edge
                ? d.edge.target.data.name
                : d.target.data.name;
              return (
                brushedNames.has(sourceName) && brushedNames.has(targetName)
              );
            });
        }

        function brushEnded(event) {
          // If the brush selection is cleared, remove all brushing classes.
          if (!event.selection) {
            node.classed("brushed", false);
            svg
              .selectAll("path.custom.edge, path.default.edge")
              .classed("brushed", false);
          }
        }

        // ─── EDGE HOVER INTERACTIVITY: FADE OTHER EDGES & TOOLTIP ─────────────
        svg
          .selectAll("path.edge")
          .on("pointerenter", function (event, d) {
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
            svg
              .selectAll("path.edge")
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

  // Expose the function globally
  window.drawRadialDiagram = drawRadialDiagram;

  // ─── INITIAL DRAWING & EVENT LISTENERS FOR DROPDOWNS & RADIO BUTTONS ─────────
  // Episode selectors for each view
  const sel1 = document.getElementById("episode-selector1");
  const sel2 = document.getElementById("episode-selector2");

  // Get the current ordering from each view's radio buttons
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

  // Add event listeners for the ordering radio buttons in each view
  const order1Radios = document.querySelectorAll('input[name="order1"]');
  order1Radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      drawRadialDiagram("#network", sel1.value, getOrder("order1"));
    });
  });

  const order2Radios = document.querySelectorAll('input[name="order2"]');
  order2Radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      drawRadialDiagram("#arc", sel2.value, getOrder("order2"));
    });
  });
})();
