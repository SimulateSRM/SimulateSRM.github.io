const szaMap = {
    '0': 29,
    '1': 88,
    '2': 96
}

const rfMap = {
    '0': 0,
    '1': 1,
    '2': 2,
    '3': 4
}

const tropoAODMap = {
    '0': '0.034',
    '1': '0.080',
    '2': '0.223',
    '3': '0.657'
}

const aerosolMap = {
    '0': 'h2so4',
    '1': 'caco3',
    '2': 'diamond'
}

const szaRange = document.getElementById("sza-range");
const szaDropdown = document.getElementById("sza-dropdown");
szaRange.addEventListener("input", (event) => {
    szaDropdown.innerHTML = String(szaMap[event.target.value]) + '°';
    updateImages();
});

const rfRange1 = document.getElementById("radforce1-range");
const rfDropdown1 = document.getElementById("radforce1-dropdown");
rfRange1.addEventListener("input", (event) => {
    rfDropdown1.innerHTML = String(-rfMap[event.target.value]) + ' W/m<sup>2</sup>';
    updateImages();
});

const rfRange2 = document.getElementById("radforce2-range");
const rfDropdown2 = document.getElementById("radforce2-dropdown");
rfRange2.addEventListener("input", (event) => {
    rfDropdown2.innerHTML = String(-rfMap[event.target.value]) + ' W/m<sup>2</sup>';
    updateImages();
});

const tropoRange1 = document.getElementById("tropo1-range");
const tropoDropdown1 = document.getElementById("tropo1-dropdown");
tropoRange1.addEventListener("input", (event) => {
    tropoDropdown1.innerHTML = String(tropoAODMap[event.target.value]);
    updateImages();
});

const tropoRange2 = document.getElementById("tropo2-range");
const tropoDropdown2 = document.getElementById("tropo2-dropdown");
tropoRange2.addEventListener("input", (event) => {
    tropoDropdown2.innerHTML = String(tropoAODMap[event.target.value]);
    updateImages();
});

const aerosolDropdown1 = document.getElementById("aerosol1-dropdown");
aerosolDropdown1.addEventListener("input", (event) => {
    updateImages();
});

const aerosolDropdown2 = document.getElementById("aerosol2-dropdown");
aerosolDropdown2.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioCylindrical = document.getElementById("btnradio-cylindrical")
btnRadioCylindrical.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioPolar = document.getElementById("btnradio-polar")
btnRadioPolar.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioCharts = document.getElementById("btnradio-charts")
btnRadioCharts.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioFOV = document.getElementById("btnradio-fov")
btnRadioFOV.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioSingle = document.getElementById("btnradio-single")
btnRadioSingle.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioSbs = document.getElementById("btnradio-sbs")
btnRadioSbs.addEventListener("input", (event) => {
    updateImages();
});

const btnRadioToggle = document.getElementById("btnradio-toggle")
btnRadioToggle.addEventListener("input", (event) => {
    updateImages();
});

const btnSwap = document.getElementById("btn-swap")
btnSwap.addEventListener("click", (event) => {
    let temp = rfRange1.value;
    rfRange1.value = rfRange2.value;
    rfRange2.value = temp;
    temp = rfDropdown1.innerHTML;
    rfDropdown1.innerHTML = rfDropdown2.innerHTML;
    rfDropdown2.innerHTML = temp;
    temp = tropoRange1.value;
    tropoRange1.value = tropoRange2.value;
    tropoRange2.value = temp;
    temp = tropoDropdown1.innerHTML;
    tropoDropdown1.innerHTML = tropoDropdown2.innerHTML;
    tropoDropdown2.innerHTML = temp;
    temp = aerosolDropdown1.value;
    aerosolDropdown1.value = aerosolDropdown2.value;
    aerosolDropdown2.value = temp;

    updateImages();
});

const altitudeRange = document.getElementById("altitude-range");
altitudeRange.addEventListener("input", (event) => {
    document.getElementById("altitude-value").innerHTML = altitudeRange.value-90;
    updateImages();
});
const azimuthRange = document.getElementById("azimuth-range");
azimuthRange.addEventListener("input", (event) => {
    document.getElementById("azimuth-value").innerHTML = azimuthRange.value;
    updateImages();
});
const rollRange = document.getElementById("roll-range");
rollRange.addEventListener("input", (event) => {
    document.getElementById("roll-value").innerHTML = rollRange.value;
    updateImages();
});

const fov = new FOVTransform();
const fovInputFormat = {
    type: 'polar',
    maxTheta: 90*Math.PI/180 // Max zenith angle in the input image
};
const fovParams = {
    fov: {
      // Human field of view (https://en.wikipedia.org/wiki/Field_of_view)
      l: 105*Math.PI/180,
      r: 105*Math.PI/180,
      u: 60*Math.PI/180,
      d: 75*Math.PI/180 
    },
    altitude: 0*Math.PI/180,
    roll: 0*Math.PI/180,
    azimuth: 0*Math.PI/180,
    interpolation: 'linear',
    outputWidth: 800,
};
const prevFOVImages = [];

async function updateImages() {
    const sza = szaMap[szaRange.value];
    const rf1 = rfMap[rfRange1.value];
    const rf2 = rfMap[rfRange2.value];
    const tropo1 = tropoAODMap[tropoRange1.value];
    const tropo2 = tropoAODMap[tropoRange2.value];
    const aerosol1 = aerosolMap[aerosolDropdown1.value];
    const aerosol2 = aerosolMap[aerosolDropdown2.value];
    const imageType = btnRadioCylindrical.checked ? "cyl" : 
        btnRadioPolar.checked ? "polar" :
        btnRadioCharts.checked ? "charts" : "fov";

    const imagesCol = document.getElementById("images-col");
    const canvasCol = document.getElementById("canvas-col");
    const img1a = document.getElementById("image1a");
    const img1b = document.getElementById("image1b");
    const img2a = document.getElementById("image2a");
    const img2b = document.getElementById("image2b");
    const canvasa = document.getElementById("canvas-a");
    const canvasb = document.getElementById("canvas-b");

    const colImg1a = document.getElementById("col-img-1a");
    const colImg1b = document.getElementById("col-img-1b");
    const colImg2a = document.getElementById("col-img-2a");
    const colImg2b = document.getElementById("col-img-2b");
    const rowCanvasA = document.getElementById("row-canvas-a");
    const rowCanvasB = document.getElementById("row-canvas-b");

    const imgTitle1a = document.getElementById("img-1a-title");
    const imgTitle1b = document.getElementById("img-1b-title");
    const imgTitle2a = document.getElementById("img-2a-title");
    const imgTitle2b = document.getElementById("img-2b-title");

    if (btnRadioSingle.checked) {
        document.getElementById("row-config-b").classList.add("d-none");
        document.getElementById("row-config-swap").classList.add("d-none");
        document.getElementById("config-a-title").innerHTML = "";
    }
    else {
        document.getElementById("row-config-b").classList.remove("d-none");
        document.getElementById("row-config-swap").classList.remove("d-none");
        document.getElementById("config-a-title").innerHTML = "<strong>Config A</strong>";
    }
    if (btnRadioFOV.checked)
        document.getElementById("row-config-fov").classList.remove("d-none");
    else
        document.getElementById("row-config-fov").classList.add("d-none");

    if (imageType === "fov") {
        imagesCol.classList.add("d-none");
        canvasCol.classList.remove("d-none");
    }
    else {
        imagesCol.classList.remove("d-none");
        canvasCol.classList.add("d-none");
    }

    if (imageType === "charts") {
        if (btnRadioSbs.checked) {
            img1a.src = `Principal Plane Plots/SpectralRad_${aerosol1}_rf${rf1}_tr${tropo1.toString().replace(".", "")}_sz${sza}.png`;
            imgTitle1a.innerHTML = `Config A - Spectral Radiance`;
            img1b.src = `Principal Plane Plots/Chromaticity_${aerosol1}_rf${rf1}_tr${tropo1.toString().replace(".", "")}_sz${sza}.png`;
            imgTitle1b.innerHTML = `Config A - Chromaticity`;
            img2a.src = `Principal Plane Plots/SpectralRad_${aerosol2}_rf${rf2}_tr${tropo2.toString().replace(".", "")}_sz${sza}.png`;
            imgTitle2a.innerHTML = `Config B - Spectral Radiance`;
            img2b.src = `Principal Plane Plots/Chromaticity_${aerosol2}_rf${rf2}_tr${tropo2.toString().replace(".", "")}_sz${sza}.png`;
            imgTitle2b.innerHTML = `Config B - Chromaticity`;
            colImg1a.classList.remove("d-none");
            colImg1b.classList.remove("d-none");
            colImg2a.classList.remove("d-none");
            colImg2b.classList.remove("d-none");
        }
        else {
            img1a.src = `Principal Plane Plots/SpectralRad_${aerosol1}_rf${rf1}_tr${tropo1.toString().replace(".", "")}_sz${sza}.png`;
            imgTitle1a.innerHTML = btnRadioToggle.checked ? `Config A - Spectral Radiance` : 'Spectral Radiance';
            img2a.src = `Principal Plane Plots/Chromaticity_${aerosol1}_rf${rf1}_tr${tropo1.toString().replace(".", "")}_sz${sza}.png`;
            imgTitle2a.innerHTML = btnRadioToggle.checked ? `Config A - Chromaticity` : 'Chromaticity';
            colImg1a.classList.remove("d-none");
            colImg1b.classList.add("d-none");
            colImg2a.classList.remove("d-none");
            colImg2b.classList.add("d-none");
            imgTitle1b.innerHTML = "";
            imgTitle2b.innerHTML = "";
        }
    }
    else if (imageType === "cyl") {
        img1a.src = `Images/allsky_rgb_${imageType}16_${aerosol1}_rf${rf1}_tr${tropo1.replace(".", "")}_sz${sza}.png`;
        img2a.src = `Images/allsky_rgb_${imageType}16_${aerosol2}_rf${rf2}_tr${tropo2.replace(".", "")}_sz${sza}.png`;
        colImg1a.classList.remove("d-none");
        btnRadioSbs.checked ? colImg2a.classList.remove("d-none") : colImg2a.classList.add("d-none");
        colImg1b.classList.add("d-none");
        colImg2b.classList.add("d-none");
        imgTitle1a.innerHTML = btnRadioSingle.checked ? '' : 'Config A';
        imgTitle1b.innerHTML = "";
        imgTitle2a.innerHTML = btnRadioSingle.checked ? '' : 'Config B';
        imgTitle2b.innerHTML = "";
    }
    else if (imageType === "polar") {
        img1a.src = `Images/allsky_rgb_${imageType}16_${aerosol1}_rf${rf1}_tr${tropo1.replace(".", "")}_sz${sza}.png`;
        img1b.src = `Images/allsky_rgb_${imageType}16_${aerosol2}_rf${rf2}_tr${tropo2.replace(".", "")}_sz${sza}.png`;
        colImg1a.classList.remove("d-none");
        btnRadioSbs.checked ? colImg1b.classList.remove("d-none") : colImg1b.classList.add("d-none");
        colImg2a.classList.add("d-none");
        colImg2b.classList.add("d-none");
        imgTitle1a.innerHTML = btnRadioSingle.checked ? '' : 'Config A';
        imgTitle1b.innerHTML = btnRadioSingle.checked ? '' : 'Config B';
        imgTitle2a.innerHTML = "";
        imgTitle2b.innerHTML = "";
    }
    else if (imageType === "fov") {
        btnRadioSbs.checked ? rowCanvasB.classList.remove("d-none") : rowCanvasB.classList.add("d-none");
        const images = [
            `Images/allsky_rgb_polar_${aerosol1}_rf${rf1}_tr${tropo1.toString().replace(".", "")}_sz${sza}.png`,
            `Images/allsky_rgb_polar_${aerosol2}_rf${rf2}_tr${tropo2.toString().replace(".", "")}_sz${sza}.png`
        ];
        let newImgs = images.length !== prevFOVImages.length;
        for (let i=0; !newImgs && i<images.length; i++) {
            if (images[i] !== prevFOVImages[i]) {
                newImgs = true;
                break;
            }
        }
        if (newImgs) {
            prevFOVImages.length = 0;
            prevFOVImages.push(...images);
            const canvases = [canvasa, canvasb];
            await fov.loadImages(images, fovInputFormat, canvases);
        }
        fovParams.altitude = altitudeRange.value*Math.PI/180-Math.PI/2;
        fovParams.azimuth = azimuthRange.value*Math.PI/180
        fovParams.roll = rollRange.value*Math.PI/180;
        fov.render(fovParams);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    updateImages();
}, false);
