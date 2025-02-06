class ScatterPlot {
  constructor(data, x, y, category) {
    this.data = data;
    this.x = x;
    this.y = y;
    this.category = category;

    //svg dimensions
    this.width = 500;
    this.height = 500;
    this.margin = 50;

    //get min and max original values 
    this.min_x = Math.min(...data.map(d => d[this.x]));
    this.max_x = Math.max(...data.map(d => d[this.x]));
    this.min_y = Math.min(...data.map(d => d[this.y]));
    this.max_y = Math.max(...data.map(d => d[this.y]));

    //shapes array for categories
    this.shapes = ["circle", "square", "triangle"];

    //map categories to shapes
    const unique_categories = Array.from(new Set(data.map(d => d[this.category])));
    this.category_2_shape = {};
    unique_categories.forEach((cat, i) => {
      this.category_2_shape[cat] = this.shapes[i % this.shapes.length];
    });
  }

  //utility function for linear scaling to fit svg 
  normalize(value, dataMin, dataMax, svgMin, svgMax) {
    //y =      m    +          x       *                     k
    return svgMin + ((value - dataMin) * (svgMax - svgMin)) / (dataMax - dataMin);
  }


  //utility function to compute euclidean distance between data points 
  eudlidean_dist(p1, p2) {
    const dx = p1[this.x] - p2[this.x];
    const dy = p1[this.y] - p2[this.y];
    return Math.sqrt(dx * dx + dy * dy);
  }

  //generate svg by adding plot elements
  generateSVG(selected_point_recenter = null, selected_point_neighbourhood = null) {
    let svg_elements = [];

    svg_elements.push(this.drawAxes());
    svg_elements.push(this.drawTicks());

    svg_elements.push(this.plotPoints(selected_point_recenter, selected_point_neighbourhood));

    //draw recenter grid around left click selected points
    if (selected_point_recenter !== null) {
      svg_elements.push(this.drawRecenterGrid(selected_point_recenter));
    }

    svg_elements.push(this.createLegend());

    return `<svg width="${this.width}" height="${this.height}">${svg_elements.join("\n")}</svg>`;
  }

  drawAxes() {
    //draw x and y axis by defining the start and end points based on the svg dismensions and the margin
    return `
      <line x1="${this.margin}" y1="${this.height - this.margin}" x2="${this.width - this.margin}" y2="${this.height - this.margin}" stroke="black"/>
      <line x1="${this.margin}" y1="${this.margin}" x2="${this.margin}" y2="${this.height - this.margin}" stroke="black"/>
    `;
  }

  drawTicks() {

    let ticks = [];
    const tickLength = 5;

    //draw 8 ticks on each axis.
    for (let i = 0; i < 9; i++) {

      //compute the spacing of the ticks based on the svg dimensions
      const xPos = this.margin + (i * (this.width - this.margin * 2)) / 8;
      const yPos = this.margin + (i * (this.height - this.margin * 2)) / 8;

      //compute corresponding tick values 
      const xTickValue = this.min_x + ((this.max_x - this.min_x) * i) / 8;
      const yTickValue = this.min_y + ((this.max_y - this.min_y) * (8 - i)) / 8;

      //apply ticks to x axis
      ticks.push(
        `<line x1="${xPos}" y1="${this.height - this.margin}" x2="${xPos}" y2="${this.height - this.margin + tickLength}" stroke="black"/>`
      );
      ticks.push(
        `<text x="${xPos}" y="${this.height - this.margin + 15}" font-size="10" text-anchor="middle">${xTickValue.toFixed(2)}</text>`
      );

      //apply ticks to y axis
      ticks.push(
        `<line x1="${this.margin - tickLength}" y1="${yPos}" x2="${this.margin}" y2="${yPos}" stroke="black"/>`
      );
      //add tick values
      ticks.push(
        `<text x="${this.margin - 10}" y="${yPos + 3}" font-size="10" text-anchor="end">${yTickValue.toFixed(2)}</text>`
      );
    }

    return ticks.join("\n");
  }

  plotPoints(selected_point_recenter = null, selected_point_neighbourhood = null) {
    let points = [];
    let nearest_neighbors = [];

    if (selected_point_neighbourhood !== null) {
      const selected = this.data[selected_point_neighbourhood];

      let distances = [];

      //iterate over all data points and compute euclidean distance
      this.data.forEach((d, i) => {
        if (i !== selected_point_neighbourhood) {
          
          const dist = this.eudlidean_dist(d, selected);

          distances.push({ index: i, dist: dist });
        }
      });

      //sort in order to get the 5 smallest distances
      distances.sort((a, b) => a.dist - b.dist);
      //take the 5 nearest neighbors
      nearest_neighbors = distances.slice(0, 5).map(obj => obj.index);

    }

    for (let i = 0; i < this.data.length; i++) {
      //get the current data point
      const d = this.data[i];

      //caluculate the normalized coordinates/values
      const cx = this.normalize(d[this.x], this.min_x, this.max_x, this.margin, this.width - this.margin);
      const cy = this.normalize(d[this.y], this.min_y, this.max_y, this.height - this.margin, this.margin);

      //save the coordinates
      d.x_svg_val = cx;
      d.y_svg_val = cy;

      //extract category shape
      const shape = this.category_2_shape[d[this.category]];

      //tooltip text 
      const tooltip = `x: ${d[this.x]}, y: ${d[this.y]}, category: ${d[this.category]}`;

      //default color
      let color = "black";
      //for highlighting
      let extra_attributes = "";

      //check if the point is selected
      if (selected_point_neighbourhood !== null) {
        
        //check if the current point is selected
        if (i === selected_point_neighbourhood) {

          //hilighlight the selected point red
          extra_attributes = 'stroke="red" stroke-width="2"';

          //highlight the nearest neighbors magenta
        } else if (nearest_neighbors.includes(i)) {
          color = "magenta";
        }

        //check if the current point is selected
      } else if (selected_point_recenter !== null) {
        const selected = this.data[selected_point_recenter];

        //handle points with same x or y value as selected point
        const dx = d[this.x] - selected[this.x];
        const dy = d[this.y] - selected[this.y]
        
        if (i !== selected_point_recenter) {
      
          if (dx < 0 && dy > 0) {
            //first quadrant
            color = "green";
          } else if (dx > 0 && dy > 0) {
            //second quadrant
            color = "gray";
          } else if (dx < 0 && dy < 0) {
            //third quadrant
            color = "purple";
          } else if (dx > 0 && dy < 0) {
            //fourth quadrant
            color = "blue";
          }
        } else {
          extra_attributes = 'stroke="red" stroke-width="2"';
        }
      }

      //make svg elements out of the points and add tootlip for hovering
      let shape_object = "";
      //it is through i we can access points, since i is the point index
      const point_ptoperties = `fill="${color}" class="data-point" data-index="${i}" data-tooltip="${tooltip}"`;

      //mark the selected point with a black stroke
      if (selected_point_recenter === i) {
        extra_attributes = 'stroke="red" stroke-width="2"';
      }

      //determine the shape and add it to the svg element
      if (shape === "circle") {
        shape_object = `<circle cx="${cx}" cy="${cy}" r="5" ${point_ptoperties} ${extra_attributes}> <title>${tooltip}</title> </circle/>`;
      } else if (shape === "square") {
        shape_object = `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" ${point_ptoperties} ${extra_attributes}> <title>${tooltip}</title> </rect/>`;
      } else if (shape === "triangle") {
        shape_object = `<polygon points="${cx - 5},${cy + 5} ${cx + 5},${cy + 5} ${cx},${cy - 5}" ${point_ptoperties} ${extra_attributes}> <title>${tooltip}</title> </polygon/>`;
      }
      points.push(shape_object);
    }
    return points.join("\n");
  }


  createLegend() {

    //initialize a legend array and where to place it
    let legend_object = [];
    const legend_x = this.width - this.margin + 10;
    const legend_y = this.margin;

    //initialize a counter for categories to assign to the legend
    let i = 0;

    //iterate category shapes and add them to legend  
    for (const cat in this.category_2_shape) {
      const shape = this.category_2_shape[cat];

      //position legend vertically
      const y_position = legend_y + i * 20;
      let shape_objects = "";

      const color = "black";

      //determine the shape
      if (shape === "circle") {
        shape_objects = `<circle cx="${legend_x}" cy="${y_position}" r="5" fill="${color}"/>`;
      } else if (shape === "square") {
        shape_objects = `<rect x="${legend_x - 5}" y="${y_position - 5}" width="10" height="10" fill="${color}"/>`;
      } else if (shape === "triangle") {
        shape_objects = `<polygon points="${legend_x - 5},${y_position + 5} ${legend_x + 5},${y_position + 5} ${legend_x},${y_position - 5}" fill="${color}"/>`;
      }

      //add shape and category name
      legend_object.push(shape_objects);
      legend_object.push(`<text x="${legend_x + 15}" y="${y_position + 3}" font-size="10">${cat}</text>`);

      //step to next category
      i++;
    }

    return legend_object.join("\n");
  }

  //from selected point, draw new axes and recenter grid around that point
  drawRecenterGrid(selected_point) {

    //get the selected point, this is origin of new axes
    const selected = this.data[selected_point];

    //return dashed lines to indicate new axes, originating from the selected point
    return `
      <line x1="${selected.x_svg_val}" y1="${this.margin}" x2="${selected.x_svg_val}" y2="${this.height - this.margin}" stroke="black" stroke-dasharray="4,4"/>
      <line x1="${this.margin}" y1="${selected.y_svg_val}" x2="${this.width - this.margin}" y2="${selected.y_svg_val}" stroke="black" stroke-dasharray="4,4"/>
    `;
  }
}
