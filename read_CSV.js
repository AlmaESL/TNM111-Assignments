let scatter_plot = null;
let selected_point_recenter = null;
let selected_point_neighbourhood = null;

//parse csv file 
function parseCSV(text) {

    //split first row
    const lines = text.trim().split("\n");

    //get the headers
    const headers = lines[0].split(",").map(h => h.trim());

    const data = [];

    //iterate through the rest of the rows
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",");
        const obj = {};

        //iterate through the columns
        headers.forEach((header, j) => {
            const num = Number(row[j]);

            //check if the value is a number or a string, ie x/y value or a category name
            obj[header] = isNaN(num) ? row[j].trim() : num;
        });
        data.push(obj);
    }
    return { headers, data };
}

//function to render scatterplot by generating the SVG and add clicking
function renderPlot() {
    if (scatter_plot) {
        //generate SVG from scatter plot class
        const svg = scatter_plot.generateSVG(selected_point_recenter, selected_point_neighbourhood);

        //display SVG in the plot container
        document.getElementById("plot-container").innerHTML = svg;

        //add clicking events
        clicking();
    }
}

//function to add left click event to the data points
function clicking() {
    const points = document.querySelectorAll(".data-point");
    points.forEach(pt => {

        //left click to recenter
        pt.addEventListener("click", function (event) {

            //stop event from bubbling
            event.preventDefault();
            event.stopPropagation();

            //get the index of the selected point
            const idx = Number(this.getAttribute("data-index"));
            
            //check if the selected point is the same as the current selected point
            if (selected_point_recenter === null || selected_point_recenter !== idx) {
                selected_point_recenter = idx;
            } else {
                selected_point_recenter = null;
            }

            renderPlot();
        });

        //right click to show 5 nearest points
        pt.addEventListener("contextmenu", function (event) {

            //stop event from bubbling
            event.preventDefault();
            event.stopPropagation();

            const idx = Number(this.getAttribute("data-index"));

            if (selected_point_neighbourhood === null || selected_point_neighbourhood !== idx) {
                selected_point_neighbourhood = idx;
            } else {
                selected_point_neighbourhood = null;
            }
            renderPlot();
        });
    });
}


//read csv file
document.getElementById("csv-file").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        const csvText = event.target.result;
        const { headers, data } = parseCSV(csvText);


        //check if CSV file has enough numerical and categorical columns.
        const numericalColumns = headers.filter(header => data.every(row => typeof row[header] === "number"));
        const nonNumericalColumns = headers.filter(header => data.some(row => typeof row[header] !== "number"));

        // Use the first two numerical columns for x and y, and the first non-numerical column as category.
        const xCol = numericalColumns[0];
        const yCol = numericalColumns[1];
        const categoryCol = nonNumericalColumns[0];

        // Create the scatter plot instance.
        scatter_plot = new ScatterPlot(data, xCol, yCol, categoryCol);
        selected_point_recenter = null;
        renderPlot();
    };
    reader.readAsText(file);
});
