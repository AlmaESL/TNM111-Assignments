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

// ─── COLOR FUNCTION ───────────────────────────────────────────────────────────

const color = (t) => d3.interpolateRdBu(1 - t);

// ─── HELPERS: ID & BILINK ─────────────────────────────────────────────────────

function id(node) {
  return node.parent && node.parent.data.name
    ? id(node.parent) + "." + node.data.name
    : node.data.name;
}

function bilink(root) {
  const map = new Map(root.leaves().map((d) => [id(d), d]));
  for (const d of root.leaves()) {
    d.incoming = [];
    d.outgoing = d.data.imports.map((i) => [d, map.get(i)]);
  }
  for (const d of root.leaves()) {
    for (const o of d.outgoing) {
      if (o[1]) o[1].incoming.push(o);
    }
  }
  return root;
}

// ─── BUNDLED PATH GENERATOR ───────────────────────────────────────────────────

const bundledPath = ([source, target]) => {
  const p = new Path();
  line.context(p)(source.path(target));
  return p;
};

// ─── MAIN DRAW FUNCTION WITH HOVER INTERACTIVITY ─────────────────────────────

function drawRadialDiagram() {
  fetch("json/starwars-full-interactions-allCharacters.json")
    .then((response) => response.json())
    .then((data) => {
      // Prepare data: initialize an empty imports array on every node.
      data.nodes.forEach((n) => {
        n.imports = [];
      });
      // For each link (by node indices), add the target node’s name to the source node's imports.
      data.links.forEach((link) => {
        data.nodes[link.source].imports.push(data.nodes[link.target].name);
      });

      // Create a dummy root so that each node becomes a child.
      const root = d3
        .hierarchy({ name: "", children: data.nodes })
        .sum((d) => d.value);

      // Add incoming/outgoing link arrays.
      const rootWithLinks = bilink(root);

      // Compute the cluster layout.
      cluster(rootWithLinks);

      // Build an array of edge objects that include source, target, and bundled path.
      const edges = rootWithLinks.leaves().flatMap((leaf) =>
        leaf.outgoing.map((link) => ({
          source: leaf,
          target: link[1],
          path: bundledPath(link),
        }))
      );

      // Separate edges based on the source node's colour.
      const customEdges = edges.filter(
        (e) => e.source.data.colour !== "#808080"
      );
      const defaultEdges = edges.filter(
        (e) => e.source.data.colour === "#808080"
      );

      // Draw custom edges (drawn as one path per edge).
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
        .attr("data-original-stroke", (d) => d.source.data.colour)
        .style("mix-blend-mode", "darken");

      // Draw default edges (using segmentation for bundling).
      svg
        .append("g")
        .attr("fill", "none")
        .selectAll("path.default")
        .data(
          d3.transpose(defaultEdges.map((e) => Array.from(e.path.split(k))))
        )
        .join("path")
        .attr("class", "default edge")
        .style("mix-blend-mode", "darken")
        .attr("stroke", (d, i) => color(d3.easeQuad(i / ((1 << k) - 1))))
        .attr("data-original-stroke", (d, i) =>
          color(d3.easeQuad(i / ((1 << k) - 1)))
        )
        .attr("d", (d) => d.join(""));

      // Draw the nodes and add labels.
      const node = svg
        .append("g")
        .selectAll("g")
        .data(rootWithLinks.leaves())
        .join("g")
        .attr("transform", (d) => `rotate(${d.x - 90}) translate(${d.y},0)`);

      node
        .append("circle")
        .attr("r", 3)
        .style("fill", (d) => d.data.colour);

      node
        .append("text")
        .attr("dy", ".31em")
        .attr("x", (d) => (d.x < 180 ? 6 : -6))
        .attr("text-anchor", (d) => (d.x < 180 ? "start" : "end"))
        .attr("transform", (d) => (d.x < 180 ? null : "rotate(180)"))
        .text((d) => d.data.name)
        .call((text) =>
          text.append("title").text(
            (d) => `${id(d)}
${d.outgoing.length} outgoing
${d.incoming.length} incoming`
          )
        );

      // ─── HOVER INTERACTIVITY ON NODES ──────────────────────────────────────
      // When hovering over a node, we adjust the edge styles:
      // - If the hovered node is gray, connected edges become red.
      // - If the hovered node is colored, connected edges show in their original stroke.
      // Non-connected edges become grayed out.

      node
        .on("mouseover", function (event, d) {
          const hoveredID = id(d);
          const isHoveredGray = d.data.colour === "#808080";
          d3.selectAll("path.edge")
            .style("opacity", function (e) {
              return id(e.source) === hoveredID || id(e.target) === hoveredID
                ? 1
                : 0.1;
            })
            .style("stroke", function (e) {
              if (id(e.source) === hoveredID || id(e.target) === hoveredID) {
                return isHoveredGray
                  ? "red"
                  : d3.select(this).attr("data-original-stroke");
              } else {
                return "#ccc";
              }
            });
        })
        .on("mouseout", function (event, d) {
          d3.selectAll("path.edge")
            .style("opacity", 1)
            .style("stroke", function () {
              return d3.select(this).attr("data-original-stroke");
            });
        });
    })
    .catch((error) => console.error("Failed to fetch data:", error));
}

drawRadialDiagram();
