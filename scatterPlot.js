class ScatterPlot {
  constructor(data, x, y, category) {
    this.data = data;
    this.x = x;
    this.y = y;
    this.category = category;

    //svg dimensions
    this.width = 700;
    this.height = 700;
    this.margin = 50;

    //get min and max original values 
    this.min_x = Math.min(...data.map(d => d[this.x]));
    this.max_x = Math.max(...data.map(d => d[this.x]));
    this.min_y = Math.min(...data.map(d => d[this.y]));
    this.max_y = Math.max(...data.map(d => d[this.y]));

    this.abs_x = Math.max(Math.abs(this.min_x), Math.abs(this.max_x));
    this.abs_y = Math.max(Math.abs(this.min_y), Math.abs(this.max_y));

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

    //x axis, normalize origo positioning the x-axis vertically in relation to the y-values range and the y-dimension
    //of the svg 
    const x_axis = this.normalize(0, -this.abs_y, this.abs_y, this.height - this.margin, this.margin);
    //y axis, normlize origo positioning the y-axis horizontally in relation to the x-values range and the x-dimension
    //ff the svg 
    const y_axis = this.normalize(0, -this.abs_x, this.abs_x, this.width - this.margin, this.margin);

    return `
      <line x1="${this.margin}" y1="${x_axis}" x2="${this.width - this.margin}" y2="${x_axis}" stroke="black"/>
      <line x1="${y_axis}" y1="${this.margin}" x2="${y_axis}" y2="${this.height - this.margin}" stroke="black"/>
    `;
  }

  drawTicks() {

    let ticks = [];
    const tick_length = 5;

    //draw 10 ticks on each axis
    for (let i = 0; i <= 9; i++) {

      //compute the spacing of the ticks based on the svg dimensions
      const x_pos = this.margin + (i * (this.width - this.margin * 2)) / 9;
      const y_pos = this.margin + (i * (this.height - this.margin * 2)) / 9;

      //compute corresponding tick values 
      const x_tick_value = -this.abs_x + (2 * this.abs_x * i) / 9;
      const y_tick_value = this.abs_y - (2 * this.abs_y * i) / 9;

      //normalize the tick positions in relation to the normalized axes
      const x_axis_tick = this.normalize(0, -this.abs_y, this.abs_y, this.height - this.margin, this.margin);
      const y_axis_tick = this.normalize(0, -this.abs_x, this.abs_x, this.margin, this.width - this.margin);

      //apply ticks and tick values to x axis
      if (Math.abs(x_tick_value) > 0.01) { //check if the tick value is close to zero, to avoid overlapping in origin
        ticks.push(`
        <line x1="${x_pos}" y1="${x_axis_tick}" x2="${x_pos}" y2="${x_axis_tick + tick_length}" stroke="black"/>`
        );

        ticks.push(`
        <text x="${x_pos - 10}" y="${x_axis_tick - tick_length + 20}" font-size="10" Ftext-anchor="middle" fill="gray">${x_tick_value.toFixed(2)}</text>
      `);
      }
      if (Math.abs(y_tick_value) > 0.01) {
        ticks.push(`<line x1="${y_axis_tick - tick_length}" y1="${y_pos}" x2="${y_axis_tick}" y2="${y_pos}" stroke="black"/>`
        );
        //apply ticks and tick values to y axis
        ticks.push(`
        <text x="${y_axis_tick - 25}" y="${y_pos + 3}" font-size="10" text-anchor="middle" fill="gray">${y_tick_value.toFixed(2)}</text>
      `);
      }
    }
    return ticks.join("\n");
  }

  plotPoints(selected_point_recenter = null, selected_point_neighbourhood = null) {

    let points = [];
    let nearest_neighbors = [];

    //check if the selected point has neighbours 
    if (selected_point_neighbourhood !== null) {

      const selected = this.data[selected_point_neighbourhood];

      let distances = [];

      //iterate over all data points and compute euclidean distances
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

    //iterate over all data points
    for (let i = 0; i < this.data.length; i++) {

      //get the current data point
      const current_point = this.data[i];

      //normalize the x and y values over the normalized axes and the svg dimensions
      const cx = this.normalize(current_point[this.x], -this.abs_x, this.abs_x, this.margin, this.width - this.margin);
      const cy = this.normalize(current_point[this.y], -this.abs_y, this.abs_y, this.height - this.margin, this.margin);

      //save the mormalized coordinates
      current_point.x_norm_val = cx;
      current_point.y_norm_val = cy;

      //tooltip text 
      const tooltip = `x: ${current_point[this.x]}, y: ${current_point[this.y]}, category: ${current_point[this.category]}`;

      //default color
      let color = "black";
      //for highlighting
      let extra_attributes = "";

      //check that there is a neighbourhood to the current point
      if (selected_point_neighbourhood !== null) {

        //check if the current point is selected
        if (i === selected_point_neighbourhood) {

          //highlight the selected point red
          extra_attributes = 'stroke="red" stroke-width="2"';

          //highlight the nearest neighbors in magenta
        } else if (nearest_neighbors.includes(i)) {
          color = "magenta";
        }

        //check if the current point is selected
      } else if (selected_point_recenter !== null) {

        //get the selected point
        const selected = this.data[selected_point_recenter];

        //compute the difference between the selected point and the current point
        const dx = current_point[this.x] - selected[this.x];
        const dy = current_point[this.y] - selected[this.y]

        
        if (dx < 0 && dy > 0) {
          //first quadrant
          color = "green";
        } else if (dx > 0 && dy > 0) {
          //second quadrant
          color = "orange";
        } else if (dx < 0 && dy < 0) {
          //third quadrant
          color = "purple";
        } else if (dx > 0 && dy < 0) {
          //fourth quadrant
          color = "blue";
        }
       
      }

      //make svg elements out of the points and add tootlip for hovering
      let shape_object = "";
      //it is through i we can access points, since i is the point index
      const point_ptoperties = `fill="${color}" class="data-point" data-index="${i}" data-tooltip="${tooltip}"`;

      //extract category shape
      const shape = this.category_2_shape[current_point[this.category]];

      //mark the selected point with a black stroke
      if (selected_point_recenter === i) {
        extra_attributes = 'stroke="red" stroke-width="2"';
      }

      //determine the shape and add it to the svg element
      if (shape === "circle") {
        //draw a circle with center in normalized value and a radius of 5
        shape_object = `<circle cx="${cx}" cy="${cy}" r="5" ${point_ptoperties} ${extra_attributes}> <title>${tooltip}</title> </circle/>`;
      } else if (shape === "square") {
        //draw square 4 normalized values in each direction from the point center, giving it a size of 8x8
        shape_object = `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" ${point_ptoperties} ${extra_attributes}> <title>${tooltip}</title> </rect/>`;
      } else if (shape === "triangle") {
        //draw a equilateral triangle, defining the three points 5 values away from the point value
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

    //iterate category shapes map and add them to legend  
    for (const cat in this.category_2_shape) {
      const shape = this.category_2_shape[cat];

      //define spacing between shapes i the legend in y-direction 
      const y_space = legend_y + i * 20;
      let shape_objects = "";

      const color = "black";

      //determine the shape
      if (shape === "circle") {
        shape_objects = `<circle cx="${legend_x}" cy="${y_space}" r="5" fill="${color}"/>`;
      } else if (shape === "square") {
        shape_objects = `<rect x="${legend_x - 5}" y="${y_space - 5}" width="10" height="10" fill="${color}"/>`;
      } else if (shape === "triangle") {
        shape_objects = `<polygon points="${legend_x - 5},${y_space + 5} ${legend_x + 5},${y_space + 5} ${legend_x},${y_space - 5}" fill="${color}"/>`;
      }

      //add shape and category name
      legend_object.push(shape_objects);
      legend_object.push(`<text x="${legend_x + 15}" y="${y_space + 3}" font-size="10">${cat}</text>`);

      //step to next category
      i++;
    }

    return legend_object.join("\n");
  }

  //from selected point, draw new axes and recenter grid around that point
  drawRecenterGrid(selected_point) {

    //get the selected point, this is origin of the new axes
    const selected = this.data[selected_point];

    //return dashed lines to indicate new axes, originating from the selected point
    //x axis is positioned using the y-value of the selected point and the available svg width
    //y axis is positioned using the x-value of the selected point and the available svg height
    return `
      <line x1="${this.margin}" y1="${selected.y_norm_val}" x2="${this.width - this.margin}" y2="${selected.y_norm_val}" stroke="black" stroke-dasharray="4,4"/>
      <line x1="${selected.x_norm_val}" y1="${this.margin}" x2="${selected.x_norm_val}" y2="${this.height - this.margin}" stroke="black" stroke-dasharray="4,4"/>
    `;
  }
}