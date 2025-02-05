class ScatterPlot {

  constructor(canvas_ID) {
    this.canvas = document.getElementById(canvas_ID);
    this.ctx = this.canvas.getContext("2d");
    this.data = [];
    this.shapes = ["circle", "square", "triangle"];
    this.category_shape_pairs = {};

    //acquire space between axes and legend, and canvas borders -> to ensure visibility
    this.margin = 50;
    this.legend_margin = 20;

    
  }

  //set data and draw 
  setData(data) {
    this.data = data;
    this.assignShapes();
    this.drawScatter();
  }

  //clear canvas 
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  //get the min and max data values (for normalization to fit canvas space)
  getValueRanges() {
    return {
      min_x: Math.min(...this.data.map(p => p.x)),
      max_x: Math.max(...this.data.map(p => p.x)),
      min_y: Math.min(...this.data.map(p => p.y)),
      max_y: Math.max(...this.data.map(p => p.y)),
    };
  }

  //function to scale data x values to fit canvas 
  scaleX(x, value_ranges) {
    return ((x - value_ranges.min_x) / (value_ranges.max_x - value_ranges.min_x)) * (this.canvas.width - 2 * this.margin) + this.margin;
  }

  //function to scale data y values to fit canvas 
  scaleY(y, value_ranges) {
    return this.canvas.height - ((y - value_ranges.min_y) / (value_ranges.max_y - value_ranges.min_y)) * (this.canvas.height - 2 * this.margin) - this.margin;
  }

  //function to draw axes, ticks and tick values, and grid lines along the ticks
  drawAxes(value_ranges) {

    //x axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.margin, this.canvas.height - this.margin);
    this.ctx.lineTo(this.canvas.width - this.margin - this.legend_margin, this.canvas.height - this.margin);
    this.ctx.strokeStyle = "black";
    this.ctx.stroke();


    //y axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.margin, this.margin);
    this.ctx.lineTo(this.margin, this.canvas.height - this.margin);
    this.ctx.strokeStyle = "black";
    this.ctx.stroke();

    //x axis ticks and tick values 
    const x_tick_interval = (value_ranges.max_x - value_ranges.min_x) / 8;
    for (let i = 1; i < 8; i++) {

      const x_value = value_ranges.min_x + i * x_tick_interval;
      const x_position = this.scaleX(x_value, value_ranges);

      this.ctx.beginPath();
      this.ctx.moveTo(x_position, this.canvas.height - this.margin);
      this.ctx.lineTo(x_position, this.canvas.height - this.margin + 5);
      this.ctx.stroke();

      //draw vertical grid lines 
      this.ctx.beginPath();
      this.ctx.moveTo(x_position, this.margin);
      this.ctx.lineTo(x_position, this.canvas.height - this.margin);
      this.ctx.stroke();
      
      //tick labels
      this.ctx.fillStyle = "black";
      this.ctx.font = "10px Arial";
      this.ctx.fillText(x_value.toFixed(2), x_position - 10, this.canvas.height - this.margin + 15);
    }


    //y axis ticks and tick values 
    const y_tick_interval = (value_ranges.max_y - value_ranges.min_y) / 8;

    for (let i = 1; i < 8; i++) {

      const y_value = value_ranges.min_y + i * y_tick_interval;
      const y_position = this.scaleY(y_value, value_ranges);

      this.ctx.beginPath();
      this.ctx.moveTo(this.margin - 5, y_position);
      this.ctx.lineTo(this.margin, y_position);
      this.ctx.stroke();

      //draw horizontal grid lines
      this.ctx.beginPath();
      this.ctx.moveTo(this.margin, y_position);
      this.ctx.lineTo(this.canvas.width - this.margin - this.legend_margin, y_position);
      this.ctx.stroke();

      this.ctx.fillStyle = "black";
      this.ctx.font = "12px Arial";
      this.ctx.fillText(y_value.toFixed(2), this.margin - 35, y_position + 1);
    }
  }


  //function to assign shapes to categories 
  assignShapes() {
    //make a set of categories mapping to ensure unique occurances only 
    let categories = [...new Set(this.data.map(p => p.category))];

    //loop categories and assign corresponding shape to each index from the shapes array
    categories.forEach((category, index) => {
      this.category_shape_pairs[category] = this.shapes[index % this.shapes.length];
    });
  }


  drawPoints(value_ranges) {
    this.data.forEach(point => {
      //get catgory's shape
      const shape = this.category_shape_pairs[point.category];

      //scale values of point 
      const x = this.scaleX(point.x, value_ranges);
      const y = this.scaleY(point.y, value_ranges);

      this.ctx.fillStyle = 'blue';
      this.ctx.lineWidth = '2';

      //depending on category, draw correct shape
      if (shape == "circle") {
        this.drawCircle(x, y);
      } else if (shape == "square") {
        this.drawSquare(x, y);
      } else if (shape == "triangle") {
        this.drawTriangle(x, y);
      }

    });
  }


  //function to draw circles 
  drawCircle(x, y) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, 5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }

  //function to draw squares 
  drawSquare(x, y) {
    this.ctx.beginPath();
    this.ctx.rect(x - 5, y - 5, 10, 10);
    this.ctx.fill();
    this.ctx.stroke();
  }

  //function to draw triangles
  drawTriangle(x, y) {
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 6);
    this.ctx.lineTo(x - 6, y + 6);
    this.ctx.lineTo(x + 6, y + 6);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
  }


  //function to draw legend 
  drawLegend() {

    //position legend
    const legend_x_pos = this.canvas.width - this.legend_margin;
    let legend_y_pos = this.margin + 10;

    //itrate categories and shapes 
    Object.keys(this.category_shape_pairs).forEach(category => {
      const shape = this.category_shape_pairs[category];

      this.ctx.fillStyle = "blue";
      this.ctx.strokeStyle = "black";

      let x = legend_x_pos - 15;
      let y = legend_y_pos;

      //depending on category, draw correct shape
      if (shape == "circle") {
        this.drawCircle(x, y);
      } else if (shape == "square") {
        this.drawSquare(x, y);
      } else if (shape == "triangle") {
        this.drawTriangle(x, y);
      }

      this.ctx.fillStyle = "black";
      this.ctx.font = "12px Arial";
      this.ctx.fillText(category, legend_x_pos-1, y + 5);

      legend_y_pos += 25; 
    }); 
  }

  //function to draw the scatter plot
  drawScatter() {
    if (this.data.length === 0) return;
    this.clearCanvas();
    const value_ranges = this.getValueRanges();
    this.drawAxes(value_ranges);
    this.drawPoints(value_ranges);
    this.drawLegend(); 
  }

}
