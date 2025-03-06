// Set up SVG canvas dimensions
const width = 500, height = 500;
const sensitivity = 75; // Controls drag sensitivity
const initialScale = 250; // Scale of the globe

// Define the globe projection (Orthographic for a 3D-like effect)
let projection = d3.geoOrthographic()
    .scale(initialScale)
    .center([0, 0])
    .rotate([0, -30]) // Initial rotation
    .translate([width / 2, height / 2]);

// Create a path generator using the projection
let path = d3.geoPath().projection(projection);

// Create the SVG element
let svg = d3.select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// Draw the background globe circle
let globe = svg.append("circle")
    .attr("fill", "#EEE")
    .attr("stroke", "#000")
    .attr("stroke-width", "0.2")
    .attr("cx", width / 2)
    .attr("cy", height / 2)
    .attr("r", initialScale);

// Enable dragging to rotate the globe
svg.call(d3.drag().on('drag', (event) => {
    const rotate = projection.rotate();
    const k = sensitivity / projection.scale();
    projection.rotate([
        rotate[0] + event.dx * k,
        rotate[1] - event.dy * k
    ]);
    path = d3.geoPath().projection(projection);
    svg.selectAll("path").attr("d", path);
}));

let map = svg.append("g"); // Group for countries
let selectedCountries = new Set();

// Load and draw world map
// 'world.json' contains the geographic data

d3.json("world.json").then(data => {
    let countries = data.features;
    map.append("g")
        .attr("class", "countries")
        .selectAll("path")
        .data(countries)
        .enter().append("path")
        .attr("class", d => "country_" + d.properties.name.replace(/ /g, "_"))
        .attr("d", path)
        .attr("fill", d => hasData(d.properties.name) ? "36454F" : "#ccc") // countries with data will be dark gray
        .style('stroke', '#fff')
        .style('stroke-width', 0.3)
        .style("opacity", 0.8)
        .on("click", (event, d) => {
            let countryName = d.properties.name;
            toggleCountry(countryName);
        })
        .on("mouseover", (event, d) => {
            d3.select("#tooltip")
                .style("visibility", "visible")
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY + 10}px`)
                .text(d.properties.name);
        })
        .on("mouseout", () => {
            d3.select("#tooltip").style("visibility", "hidden");
        });
});


function hasData(country) {
    return (
        healthData.some(d => d.Entity === country) ||
        militaryData.some(d => d.Entity === country) ||
        educationData.some(d => d.Entity === country)
    );
}

// Load health, military, and education data from JSON files
let healthData, militaryData, educationData;

Promise.all([
    d3.json("cleaned_healthSpendinga.json"),
    d3.json("cleaned_milSpendinga.json"),
    d3.json("cleaned_educSpendinga.json")
]).then(([health, military, education]) => {
    healthData = health;
    militaryData = military;
    educationData = education;
});

// Stacked Bar Chart Setup
const chartWidth = 600, chartHeight = 400;
const chartSvg = d3.select("#chart")
    .append("svg")
    .attr("width", chartWidth)
    .attr("height", chartHeight)
    .append("g")
    .attr("transform", "translate(50,50)");

// Define scales and axes
const xScale = d3.scaleBand().range([0, 500]).padding(0.2);
const yScale = d3.scaleLinear().range([300, 0]);
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

chartSvg.append("g").attr("class", "x-axis").attr("transform", "translate(0,300)");
chartSvg.append("g").attr("class", "y-axis");

// Tooltip for displaying values in the bar chart
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background-color", "rgba(0, 0, 0, 0.7)")
    .style("color", "white")
    .style("padding", "5px")
    .style("border-radius", "3px")
    .style("visibility", "hidden")
    .text("Tooltip");



// Handle country selection and fetch expenditure data
function toggleCountry(country) {
    // convert set into an array
    if ([...selectedCountries].some(d => d.name === country)) {
        // found a match
        // toggle feature: we remove it from the set
        selectedCountries = new Set([...selectedCountries].filter(d => d.name !== country));
    } else {
        // country has not been selected yet, add the relevant data
        let newData = {
            name: country,
            data: {
                "Health": getDataForCountry(healthData, country, "Domestic general government health expenditure (GGHE-D) as percentage of general government expenditure (GGE) (%)") || 0,
                "Military": getDataForCountry(militaryData, country, "Military expenditure (% of government spending)") || 0,
                "Education": getDataForCountry(educationData, country, "Government expenditure on education, total (% of government expenditure)") || 0
            }
        };
        selectedCountries.add(newData);
    }
    updateChart();
}

// Retrieve data for a specific country
function getDataForCountry(dataset, country, key) {
    const countryData = dataset.find(d => d.Entity === country);
    return countryData ? countryData[key] : null;
}

// Update Stacked Bar Chart
function updateChart() {
    const dataArray = Array.from(selectedCountries);
    if (dataArray.length === 0) {
        chartSvg.selectAll(".bar-group").remove();


        xScale.domain([]);
        chartSvg.select(".x-axis")
            .call(d3.axisBottom(xScale)) // reset all marks on the x-axis
            .selectAll("text")  // Select all labels
            .remove();          // clear the labels
        return;
    }

    const spendingAreas = ["Health", "Military", "Education"];
    xScale.domain(dataArray.map(d => d.name));
    yScale.domain([0, d3.max(dataArray, d => spendingAreas.reduce((sum, key) => sum + d.data[key], 0))]);

    chartSvg.select(".x-axis").call(d3.axisBottom(xScale));
    chartSvg.select(".y-axis").call(d3.axisLeft(yScale));

    const stackedData = d3.stack().keys(spendingAreas).value((d, key) => d.data[key])(dataArray);

    const bars = chartSvg.selectAll(".bar-group")
    .data(stackedData, d => d.key);

bars.enter()
    .append("g")
    .attr("class", "bar-group")
    .attr("fill", d => colorScale(d.key))
    .merge(bars)
    .selectAll("rect")
    .data(d => d)
    .join("rect")
    .attr("x", d => xScale(d.data.name))
    .attr("y", d => yScale(d[1]))
    .attr("height", d => yScale(d[0]) - yScale(d[1]))
    .attr("width", xScale.bandwidth())
    .on("mouseover", (event, d) => {
        tooltip.style("visibility", "visible")
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY + 10}px`)
            .text(` ${d[1] - d[0]}%`);
    })
    .on("mouseout", () => {
        tooltip.style("visibility", "hidden");
    });

bars.exit().remove();

}

// Create a legend for the stacked bar chart
function createLegend() {
    const legend = d3.select("#legend").append("svg")
        .attr("width", 200)
        .attr("height", 100)
        .selectAll("g")
        .data(["Health", "Military", "Education"])
        .enter()
        .append("g")
        .attr("transform", (d, i) => `translate(0,${i * 20})`);

    legend.append("rect")
        .attr("width", 18)
        .attr("height", 18)
        .attr("fill", d => colorScale(d));

    legend.append("text")
        .attr("x", 25)
        .attr("y", 9)
        .attr("dy", ".35em")
        .text(d => d);
}

// Initialize legend
createLegend();