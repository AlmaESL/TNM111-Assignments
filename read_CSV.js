//function reading a csv file 
function readCSV(file, scatterPlot) {

    //read csv file with a file reader
    const reader = new FileReader();
    reader.onload = function (event) {
        const content = event.target.result;
        //parse into an array
        const data = parseCSV(content);
        
        //call scatter plot drawing function
        scatterPlot.setData(data); 
    };
    reader.readAsText(file);
}


function parseCSV(content) {
    
    const rows = content.trim().split("\n"); 
    return rows.map(row => {
        const [x, y, category] = row.split(",").map((value, index) => index < 2 ? Number(value) : value.trim());
        return {x, y, category}; 
    });
}