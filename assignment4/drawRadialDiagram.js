// ─── DIMENSIONS, SVG, & CLUSTER LAYOUT ─────────────────────────────────────────
const width = 700,
  height = 700,
  radius = width / 2,
  k = 6; // number of segments used for edge bundling

const svg = d3
  .select("svg")
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
function drawRadialDiagram() {
  fetch("json/starwars-full-interactions-allCharacters.json")
    .then((response) => response.json())
    .then((data) => {
      // Create a dummy root so that each node becomes a child.
      const root = d3
        .hierarchy({ name: "", children: data.nodes })
        .sum((d) => d.value);

      // Compute the cluster layout.
      cluster(root);

      // Build a mapping from node name to the corresponding leaf node.
      const nameToNode = new Map(root.leaves().map((d) => [d.data.name, d]));

      // Build a unique, undirected edge for each link.
      // Using a Map with a combined key prevents duplicates.
      const edgesMap = new Map();
      data.links.forEach((link) => {
        const sourceName = data.nodes[link.source].name;
        const targetName = data.nodes[link.target].name;
        // Order names to have a consistent key (e.g. "A-B" rather than "B-A")
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
            });
          }
        }
      });
      const edges = Array.from(edgesMap.values());

      // // Compute an interaction count for each node.
      // root.leaves().forEach((node) => {
      //   node.data.value = edges.filter(
      //     (e) => e.source === node || e.target === node
      //   ).length;
      // });

      // Separate edges into two groups.
      const customEdges = edges.filter(
        (e) => e.source.data.colour !== "#808080"
      );
      const defaultEdges = edges.filter(
        (e) => e.source.data.colour === "#808080"
      );

      // Draw custom edges (one path per edge).
      svg
        .append("g")
        .attr("fill", "none")
        .selectAll("path.custom")
        .data(customEdges)
        .enter()
        .append("path")
        .attr("class", "custom edge")
        .attr("d", (d) => d.path.toString())
        // Store the original stroke (the source's color) for restoration.
        .style("stroke", (d) => d.source.data.colour)
        .attr("data-original-stroke", (d) => d.source.data.colour);
      // .style("mix-blend-mode", "darken"); // optional

      // For default edges, bind an object that includes the original edge.
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
        // Set the default stroke to grey.
        .attr("stroke", "#ccc")
        .attr("data-original-stroke", "#ccc")
        .attr("d", (d) => d.segments.join(""));

      // Draw the nodes and add labels.
      const node = svg
        .append("g")
        .selectAll("g")
        .data(root.leaves())
        .join("g")
        .attr("transform", (d) => `rotate(${d.x - 90}) translate(${d.y},0)`);

      node
        .append("circle")
        .attr("r", 5)
        .style("fill", (d) => d.data.colour)
        .call((text) =>
          text
            .append("title")
            .text((d) => `Appeared in ${d.data.value} scenes.`)
        );

      node
        .append("text")
        .attr("dy", ".31em")
        .style("fill", (d) => d.data.colour)
        .attr("x", (d) => (d.x < 180 ? 6 : -6))
        .attr("text-anchor", (d) => (d.x < 180 ? "start" : "end"))
        .attr("transform", (d) => (d.x < 180 ? null : "rotate(180)"))
        .text((d) => d.data.name)
        .call((text) =>
          text
            .append("title")
            .text((d) => `Appeared in ${d.data.value} scenes.`)
        );

      // ─── HOVER INTERACTIVITY ON NODES ──────────────────────────────────────
      let selectedNode = null; // Track currently selected node

      node
        .on("mouseover", function (event, d) {
          // Skip hover if a node is selected
          if (selectedNode) return;

          // Determine the hovered color:
          // If the hovered node is gray (#808080), use red; otherwise, use the node's color.
          const hoveredColor =
            d.data.colour === "#808080" ? "red" : d.data.colour;
          const hoveredID = id(d);
          d3.selectAll("path.edge")
            .style("opacity", function (dd) {
              // For default edges, the original edge is stored in dd.edge;
              // for custom edges, dd is already the edge object.
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
        })
        .on("mouseout", function () {
          // Skip mouseout if a node is selected
          if (selectedNode) return;

          // Restore each edge's original stroke and opacity.
          d3.selectAll("path.edge")
            .style("opacity", 1)
            .style("stroke", function (dd) {
              // For default edges, dd.edge is stored; for custom, dd is the edge.
              const e = dd.edge ? dd.edge : dd;
              return d3.select(this).attr("data-original-stroke");
            });
        })
        .on("click", function (event, d) {
          if (selectedNode && selectedNode === d) {
            // If clicked node is already selected, unselect it
            selectedNode = null;

            // Restore all edges
            d3.selectAll("path.edge")
              .style("opacity", 1)
              .style("stroke", function (dd) {
                return d3.select(this).attr("data-original-stroke");
              });
          } else {
            selectedNode = d;

            const selectedColor =
              d.data.colour === "#808080" ? "red" : d.data.colour;
            const selectedID = id(d);

            d3.selectAll("path.edge")
              .style("opacity", function (dd) {
                const e = dd.edge ? dd.edge : dd;
                return id(e.source) === selectedID ||
                  id(e.target) === selectedID
                  ? 1
                  : 0.01;
              })
              .style("stroke", function (dd) {
                const e = dd.edge ? dd.edge : dd;
                return id(e.source) === selectedID ||
                  id(e.target) === selectedID
                  ? selectedColor
                  : "#ccc";
              });
          }
        });

      // ─── CLICK ANYWHERE TO UNSELECT ──────────────────────────────────────────────

      // Clicking outside nodes unselects the current selection
      d3.select("body").on("click", function (event) {
        // Ignore click if it was on a node
        const clickedElement = event.target;
        if (
          clickedElement.tagName === "circle" ||
          clickedElement.tagName === "text"
        ) {
          return;
        }

        // Clear selection
        selectedNode = null;
        d3.selectAll("path.edge")
          .style("opacity", 1)
          .style("stroke", function (dd) {
            return d3.select(this).attr("data-original-stroke");
          });
      });
    })
    .catch((error) =>
      console.error("Failed to fetch data (or process diagram):", error)
    );
}

drawRadialDiagram();
