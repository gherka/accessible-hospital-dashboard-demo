// Change default colours to silence console backwards compatibility warning
dc.config.defaultColors(d3.schemeTableau10)

d3.csv("data/clean_open_data.csv")
    .then(data => {

      // CROSSFILTER DIMENSIONS
      const facts = crossfilter(data);
      const boardDim = facts.dimension(d => d.HBName);
      const hospDim = facts.dimension(d => d.LocationName);
      const specDim = facts.dimension(d => d.SpecialtyName);

      const parseDate = d3.timeParse("%YQ%q");
      data.forEach(d => d.Quarter = parseDate(d.Quarter));
      const dateDim = facts.dimension(d => d.Quarter);
      // duplicate dimension to enable us to filter time series
      const dateDimDropdown = facts.dimension(d => d.Quarter);
      
      // ================
      // DROPDOWN WIDGETS
      // ================

      // DC.JS DYNAMIC DROPDOWNS (HEALTH BOARD & HOSPITAL)
      const boardDropdown = new dc.SelectMenu("#board-dropdown")
      const hospDropdown = new dc.SelectMenu("#hospital-dropdown")

      boardDropdown
        .dimension(boardDim)
        .group(boardDim.group())
        .title(d => d.key);

      hospDropdown
        .dimension(hospDim)
        .group(hospDim.group())
        .title(d => d.key);

      // VANILLA JS DATE DROPDOWNS
      const dateFromDropdown = document.getElementById("date-from");
      const dateToDropdown = document.getElementById("date-to");

      const allDates = dateDimDropdown.group().all();

      let dateFromCurrent = new Date(allDates[0].key);
      let dateToCurrent = new Date(allDates[allDates.length-1].key);
      
      // redraw all charts on date dropdown selection
      const updateDateFrom = (event) => {
      
        dateFromCurrent = new Date(event.target.value)
        dateDimDropdown.filterRange([dateFromCurrent, moment(dateToCurrent).add(1, "quarter")]);
        dc.redrawAll();

      }

      const updateDateTo = (event) => {
      
        dateToCurrent = new Date(event.target.value)
        dateDimDropdown.filterRange([dateFromCurrent, moment(dateToCurrent).add(1, "quarter")]);
        dc.redrawAll();

      }

      dateFromDropdown.addEventListener("change", updateDateFrom);
      dateToDropdown.addEventListener("change", updateDateTo);

      // populate the dropdown with date values
      allDates.forEach(d => {

        let newFromDate = document.createElement("option")
        let newToDate = document.createElement("option")
        
        newFromDate.value = d.key;
        newToDate.value = d.key;

        newFromDate.innerHTML = `${d3.timeFormat("%Y Quarter %q")(d.key)}`;
        newToDate.innerHTML = `${d3.timeFormat("%Y Quarter %q")(d.key)}`;

        dateFromDropdown.appendChild(newFromDate);
        dateToDropdown.appendChild(newToDate);
       
      })

      // set default date values
      const defaultFrom = new Date(2014, 9, 1) // months are zero-indexed
      const defaultTo =  new Date(2019, 6, 1)

      const setDateDefaults = (dropdown, defaultDate) => { 

        for(let i, j = 0; i = dropdown.options[j]; j++) {
          if(i.value == defaultDate) {
              dropdown.selectedIndex = j;
              break;
          }
        }
      };

      setDateDefaults(dateFromDropdown, defaultFrom);
      setDateDefaults(dateToDropdown, defaultTo);

      
      // AGGREGATE REDUCE FUNCTIONS
      const reduceAdd = (p, d) => { 
        p.numerator += +d.Episodes;
        p.denominator += +d.LengthOfEpisode;
        p.avlos = p.numerator / p.denominator

        return p;
        };

      const reduceRemove = (p, d) => { 
        p.numerator -= +d.Episodes;
        p.denominator -= +d.LengthOfEpisode;
        p.avlos = p.numerator / p.denominator

        return p;
        };

      const reduceInitial = () => { return { numerator: 0, denominator: 0, avlos: 0 }};

      // Chart elements (circles, bars) will be hidden if filtering results in null / zero values
      function remove_empty_bins(source_group) {
        return {
            all:function () {
                return source_group.all().filter(function(d) {
                    return Math.abs(d.value.avlos) > 0.00001 && isFinite(d.value.avlos);
                });
            }
        };
      }

      // ===============
      // SUMMARY NUMBERS
      // ===============

      // EPISODES
      const summaryEpisodes = new dc.NumberDisplay("#summary-episodes");
      const summaryEpisodesGroup = facts.groupAll().reduceSum(d => d.Episodes);

      summaryEpisodes
        .group(summaryEpisodesGroup)
        .valueAccessor(d => d); // quirk of using groupAll()

      // BED DAYS
      const summaryBedDays = new dc.NumberDisplay("#summary-bed-days");
      const summaryBedDaysGroup = facts.groupAll().reduceSum(d => d.LengthOfEpisode);

      summaryBedDays
        .group(summaryBedDaysGroup)
        .valueAccessor(d => d);

      // AVERAGE LENGTH OF STAY
      const summaryAvlos = new dc.NumberDisplay("#summary-avlos");
      const summaryAvlosGroup = facts.groupAll().reduce(reduceAdd, reduceRemove, reduceInitial);

      summaryAvlos
        .group(summaryAvlosGroup)
        .formatNumber(d3.format(".2"))
        .valueAccessor(d => d.avlos);

      // ======
      // CHARTS
      // ======

      // LINE CHART
      const lineTotal = dateDim.group().reduce(reduceAdd, reduceRemove, reduceInitial);
      const nonEmptyLineTotal = remove_empty_bins(lineTotal);
      const compositeChart = new dc.CompositeChart("#line-chart");
      const getValue = d => isFinite(d.value.avlos) ? d.value.avlos : 0

      compositeChart
        .width(900)
        .height(400)
        .useViewBoxResizing(true)
        .margins({top: 30, right: 10, bottom: 30, left: 40})
        .dimension(dateDim)
        .title(d => { return [
          `Date: ${d3.timeFormat("%Y Quarter %q")(d.key)}`,
          `Numerator: ${d.value.numerator}`,
          `Denominator: ${d.value.denominator}`,
          `Average length of stay: ${Math.round(d.value.avlos * 100) / 100}`].join('\n')
        }) 
        .compose([
          dc.lineChart(compositeChart)
            .group(nonEmptyLineTotal)
            .valueAccessor(getValue),   
          dc.bubbleChart(compositeChart)
            .group(nonEmptyLineTotal)
            .valueAccessor(getValue)
            .radiusValueAccessor(p => 1)
            .r(d3.scaleLinear().domain([1,1]))
            .maxBubbleRelativeSize(0.001) //hacky
            .colors("#8da0cb")
            .renderLabel(false)
            .renderTitle(true)
        ])
        .brushOn(false)
        .x(d3.scaleTime().domain(d3.extent(data, (d) => d.Quarter )))
        .yAxisLabel("Average Length of Stay (episodes)")
        .elasticY(true)
        .elasticX(true)
        .clipPadding(10);
        
      // SPECLIATIES BAR CHART
      const rowChart = new dc.RowChart("#row-chart");
      const rowTotal = specDim.group().reduce(reduceAdd, reduceRemove, reduceInitial);
      const nonEmptyRowTotal = remove_empty_bins(rowTotal);

      rowChart
        .width(900)
        .height(400)
        .useViewBoxResizing(true)
        .margins({top: 30, right: 10, bottom: 30, left: 210})
        .dimension(specDim)
        .ordering(d => -d.value.avlos)
        .colors("#66c2a5")
        .group(nonEmptyRowTotal)
        .labelOffsetX(-210)
        .valueAccessor(getValue)
        .title(d => { return [
          `Specialty: ${d.key}`,
          `Numerator: ${d.value.numerator}`,
          `Denominator: ${d.value.denominator}`,
          `Average length of stay: ${Math.round(d.value.avlos * 100) / 100}`].join('\n')
        }) 
        .elasticX(true);

      // TABLE
      const dataTable = new dc.DataTable("#viz-table");
      const tableDim = facts.dimension(d => d.index);
      
      dataTable
        .width(900)
        .height(500)
        .useViewBoxResizing(true)
        .dimension(tableDim)
        .size(100)
        .showSections(false)
        .sortBy(d => d.Quarter)
        .columns([
          {
            label:"Quarter",
            format: d => `${d3.timeFormat("%Y Quarter %q")(d.Quarter)}`
          },
          {
            label: "Location",
            format: d => d.LocationName
          },
          {
            label: "Specialty",
            format: d => d.SpecialtyName
          },
          "Episodes",
          {
            label: "Bed days",
            format: d => d.LengthOfEpisode
          }]);
        

      // ACCESSIBILITY HACKS AFTER RENDERING
      // adding elements like <title> to svg doesn't work on renderlet - has to be postRender

      // Tooltips via <title> are only read by Narrator and only in Firefox
      // Summary numbers are read by NVDA, but not Narrator.
      
      // ADD ARIA-LIVE regions to Number Display (spans will need IDs as changes happen to inner HTML)
      // Only works reliably in Chrome and NVDA - not Narrator!
      // Triggers on every change, not just based on aria-controls
      // NVDA space and enter don't work on SVG element controls - tabbing works, but clicking doesn't.

      summaryEpisodes.on("postRender", () => {
        
        d3.select("#summary-episodes .number-display")
          .attr("id", "summary-episodes-span")
          .attr("aria-label", "Change to total number of episodes")
          .attr("aria-live", "polite");
          
      });
      
      // SelectMenu need to be labelled
      boardDropdown.on("postRender", () => {
        
        d3.select("#board-dropdown .dc-select-menu")
        .attr("aria-labelledby", "board-dropdown-label");
  
      });

      hospDropdown.on("postRender", () => {
        
        d3.select("#hospital-dropdown .dc-select-menu")
        .attr("aria-labelledby", "hospital-dropdown-label");
  
      });


      // LINE CHART
      compositeChart.on("postRender", () => {
               
        // make sure the svg as a whole has a tabindex
        const chartSVG = d3.select("#line-chart svg");
        chartSVG
          .attr("tabindex", 0)
          .attr("aria-labelledby", "line-chart-svg-title");

        // and a title to be read aloud on tab navigation
        const chartTitle = document.createElement("title");

        chartTitle
          .setAttribute("id", "line-chart-svg-title");
        chartTitle.innerHTML = "Time series of average length of stay";

        chartSVG.node().insertBefore(chartTitle, chartSVG.node().firstChild);
        
        // inner elements must also be accessbile from keyboard
        const circles = d3.selectAll("#line-chart .chart-body .bubble");
        circles
          .attr("tabindex", 0);
        
      });

      // If you're doing enter() exit() filtering, need to re-apply tabindex!
      compositeChart.on("postRedraw", () => {
        // inner elements must also be accessbile from keyboard
        const circles = d3.selectAll("#line-chart .chart-body .bubble");
        circles
          .attr("tabindex", 0);
      });

      //ROW CHART
      rowChart.on("postRender", () => {
               
        // make sure the svg as a whole has a tabindex
        const chartSVG = d3.select("#row-chart svg");
        chartSVG
          .attr("tabindex", 0)
          .attr("aria-labelledby", "row-chart-svg-title");

        // and a title to be read aloud on tab navigation
        const chartTitle = document.createElement("title");

        chartTitle
          .setAttribute("id", "row-chart-svg-title");
        chartTitle.innerHTML = "Horizintal bar chart showing specialties sorted by average length of stay";

        chartSVG.node().insertBefore(chartTitle, chartSVG.node().firstChild);
        
        // inner elements must also be accessbile from keyboard
        const bars = d3.selectAll("#row-chart rect");
        bars
          .attr("tabindex", 0);
        
      });

      // If you're doing enter() exit() filtering, need to re-apply tabindex!
      rowChart.on("postRedraw", () => {
        // inner elements must also be accessbile from keyboard
        const bars = d3.selectAll("#row-chart rect");
        bars
          .attr("tabindex", 0);
      });


      dc.renderAll();

    })
    .catch(err => console.log(err));
