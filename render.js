// This code is supposed to run in a separate thread (a worker).
// Given an imput image in cylindrical or polar projection, it renders a new image in stereographic projection
// that tries to mimic the field of view of a human observer (but the FOV angles can be adjusted).

// ****************************************************
// BEGIN: code from https://github.com/jaxry/panorama-to-cubemap
// ****************************************************
function clamp(x, min, max) {
  return Math.min(max, Math.max(x, min));
}

function mod(x, n) {
  return ((x % n) + n) % n;
}

function interpolateNearest(read, write) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  return (xFrom, yFrom, to) => {

    const nearest = readIndex(
      clamp(Math.round(xFrom), 0, width - 1),
      clamp(Math.round(yFrom), 0, height - 1)
    );

    for (let channel = 0; channel < 3; channel++) {
      write.data[to + channel] = data[nearest + channel];
    }
  };
}

function interpolateBilinear(read, write) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  return (xFrom, yFrom, to) => {
    const xl = clamp(Math.floor(xFrom), 0, width - 1);
    const xr = clamp(Math.ceil(xFrom), 0, width - 1);
    const xf = xFrom - xl;

    const yl = clamp(Math.floor(yFrom), 0, height - 1);
    const yr = clamp(Math.ceil(yFrom), 0, height - 1);
    const yf = yFrom - yl;

    const p00 = readIndex(xl, yl);
    const p10 = readIndex(xr ,yl);
    const p01 = readIndex(xl, yr);
    const p11 = readIndex(xr, yr);

    for (let channel = 0; channel < 3; channel++) {
      const p0 = data[p00 + channel] * (1 - xf) + data[p10 + channel] * xf;
      const p1 = data[p01 + channel] * (1 - xf) + data[p11 + channel] * xf;
      write.data[to + channel] = Math.ceil(p0 * (1 - yf) + p1 * yf);
    }
  };
}

// performs a discrete convolution with a provided kernel
function kernelResample(read, write, filterSize, kernel) {
  const {width, height, data} = read;
  const readIndex = (x, y) => 4 * (y * width + x);

  const twoFilterSize = 2*filterSize;
  const xMax = width - 1;
  const yMax = height - 1;
  const xKernel = new Array(4);
  const yKernel = new Array(4);

  return (xFrom, yFrom, to) => {
    const xl = Math.floor(xFrom);
    const yl = Math.floor(yFrom);
    const xStart = xl - filterSize + 1;
    const yStart = yl - filterSize + 1;

    for (let i = 0; i < twoFilterSize; i++) {
      xKernel[i] = kernel(xFrom - (xStart + i));
      yKernel[i] = kernel(yFrom - (yStart + i));
    }

    for (let channel = 0; channel < 3; channel++) {
      let q = 0;

      for (let i = 0; i < twoFilterSize; i++) {
        const y = yStart + i;
        const yClamped = clamp(y, 0, yMax);
        let p = 0;
        for (let j = 0; j < twoFilterSize; j++) {
          const x = xStart + j;
          const index = readIndex(clamp(x, 0, xMax), yClamped);
          p += data[index + channel] * xKernel[j];

        }
        q += p * yKernel[i];
      }

      write.data[to + channel] = Math.round(q);
    }
  };
}

function interpolateBicubic(read, write) {
  const b = -0.5;
  const kernel = x => {
    x = Math.abs(x);
    const x2 = x*x;
    const x3 = x*x*x;
    return x <= 1 ?
      (b + 2)*x3 - (b + 3)*x2 + 1 :
      b*x3 - 5*b*x2 + 8*b*x - 4*b;
  };

  return kernelResample(read, write, 2, kernel);
}

function interpolateLanczos(read, write) {
  const filterSize = 5;
  const kernel = x => {
    if (x === 0) {
      return 1;
    }
    else {
      const xp = Math.PI * x;
      return filterSize * Math.sin(xp) * Math.sin(xp / filterSize) / (xp * xp);
    }
  };

  return kernelResample(read, write, filterSize, kernel);
}

// ****************************************************
// END: code from https://github.com/jaxry/panorama-to-cubemap
// ****************************************************

function angleInRange(angle) {
  let temp = angle;
  while (temp < 0)
    temp += 2*Math.PI;
  while (temp >= 2*Math.PI)
    temp -= 2*Math.PI;
  return temp;
}

// Given the information about the field of view and the direction in which the observer is looking (fixation point),
// it renders an input image (in cylindrical or polar projection) to a new image in using a stereographic projection.
// See https://en.wikipedia.org/wiki/Stereographic_projection for more details.
// 
// The math follows the following setup for the stereographic projection::
//   - The projection plane is situated at z = 0
//   - Unit sphere (r=1)
//   - The observer is at the north pole of this sphere (0, 0, 1)
//   - As a starting point, the input image is mapped to the sphere as follows:
//     - The horizon line is situated on the x-z plane
//     - y > 0: sky
//     - y < 0: ground
//     - (0, 0, -1) corresponds to azimuth=0 and zenith angle=Pi/2 in the input image
//   - Conceptually, the spherical image is then rotated to adjust the fixation point (altitude, azimuth, roll).
//     This is done without changing anything else in the setup (i.e. the observer is still at the north pole and the
//     projection plane is still at z = 0)
// 
// Once everything is setup, the stereographic projection is done as follows:
//   - For each pixel in the output image, and given the projection setup, calculate the corresponding 3D point on the sphere
//   - Figure out what pixel in the input image corresponds to this 3D point (after applying the mentioned rotations)
//   - Interpolate and copy the input pixel to the output pixel
function render({config, data: readData}) {
  const {inputFormat, fov, interpolation} = config;
  
  // First, we calculate the (unitless) size of the output image based on the field of view angles
  const height = Math.sin(Math.PI-fov.u)/(1-Math.cos(Math.PI-fov.u)) + Math.sin(Math.PI-fov.d)/(1-Math.cos(Math.PI-fov.d));
  const width = Math.sin(Math.PI-fov.l)/(1-Math.cos(Math.PI-fov.l)) + Math.sin(Math.PI-fov.r)/(1-Math.cos(Math.PI-fov.r));
  // Set the size of the output image in pixels. This is arbitrary
  const widthpx = config.outputWidth ? Math.round(config.outputWidth): inputFormat.type === "cylindrical" ? Math.round(readData.width*(fov.l+fov.r)/(2*Math.PI)) : Math.round(readData.width*3/4);
  const heightpx = Math.round(widthpx * height / width);

  // Create a new ImageData object to store the output image
  const writeData = new ImageData(widthpx, heightpx);

  const interpolate =
    interpolation === 'linear' ? interpolateBilinear(readData, writeData) :
    interpolation === 'cubic' ? interpolateBicubic(readData, writeData) :
    interpolation === 'lanczos' ? interpolateLanczos(readData, writeData) :
    interpolateNearest(readData, writeData);

  // Process pixel by pixel
  for (let x = 0; x < widthpx; x++) {
    for (let y = 0; y < heightpx; y++) {
      const to = 4 * (y * widthpx + x);

      // Map this pixel to the corresponding 3D point in the projection sphere (see https://en.wikipedia.org/wiki/Stereographic_projection)
      const normX_ = (x-widthpx*(fov.l/(fov.l+fov.r)))/widthpx * width;
      const normY_ = (-y+heightpx*(fov.u/(fov.u+fov.d)))/heightpx * height;
      const normX = Math.cos(config.roll)*normX_ - Math.sin(config.roll)*normY_;
      const normY = Math.sin(config.roll)*normX_ + Math.cos(config.roll)*normY_;
      let v = {
        x: 2*normX/(1 + normX**2 + normY**2),
        y: 2*normY/(1 + normX**2 + normY**2),
        z: (-1 + normX**2 + normY**2)/(1 + normX**2 + normY**2),
      };

      // Adjust altitude by rotating along the x-axis
      v = { x: v.x, y: Math.cos(config.altitude)*v.y - Math.sin(config.altitude)*v.z, z: Math.sin(config.altitude)*v.y + Math.cos(config.altitude)*v.z };
      // Adjust azimuth by rotating along the y-axis
      v = { x: Math.cos(config.azimuth)*v.x - Math.sin(config.azimuth)*v.z, y: v.y, z: Math.sin(config.azimuth)*v.x + Math.cos(config.azimuth)*v.z };
      // Here, we could rotate along the fixation point's vector to apply the roll, but it's easier (and it requires less operations)
      // to just rotate the output pixel (done above)
 
      // Now calculate the azimuth and zenith angle of the rotated vector, which will be used to find the corresponding pixel in the input image
      let azimuth = angleInRange(Math.atan2(v.z, v.x));
      let zenithAngle = Math.asin(-v.y) + Math.PI/2;
      const belowHorizon = zenithAngle > inputFormat.maxTheta;
      zenithAngle = Math.min(zenithAngle, inputFormat.maxTheta);
      
      // From zenith angle and azimuth, calculate input pixel coordinates. This depends on the type of input image
      let inputX, inputY;
      if (inputFormat.type === 'cylindrical') {
        inputX = azimuth / (2*Math.PI) * readData.width;
        inputX = inputX >= readData.width ? inputX - readData.width : inputX;
        inputY = Math.min((zenithAngle) / inputFormat.maxTheta * readData.height, readData.height - 1);
      }
      else if (inputFormat.type === 'polar') {
        let tempX, tempY;
        tempX = (zenithAngle) / inputFormat.maxTheta * Math.cos(azimuth);
        tempY = (zenithAngle) / inputFormat.maxTheta * Math.sin(azimuth);
        inputX = clamp(readData.width/2 + tempX * readData.width/2, 0, readData.width-1);
        inputY = clamp(readData.height/2 - tempY * readData.height/2, 0, readData.height-1);
      }
 
      // Interpolate input pixel and copy to output pixel
      if (belowHorizon && inputFormat.type === 'polar') {
        writeData.data[to] = 100;
        writeData.data[to + 1] = 103;
        writeData.data[to + 2] = 83;
        writeData.data[to + 3] = 255;
      }
      else {
        writeData.data[to + 3] = 255; // alpha channel
        interpolate(inputX, inputY, to);
      }
      // For testing and debugging: draw reference great circles
      // if (Math.abs(rotatedTheta) < Math.PI/300  ||  (Math.abs(rotatedPhi) < Math.PI/300)) {
      //   writeData.data[to] = 255;
      //   writeData.data[to + 1] = 0;
      //   writeData.data[to + 2] = 0;
      //   writeData.data[to + 3] = 255;
      // }
      // else if (Math.abs(rotatedTheta-Math.PI/18) < Math.PI/300  ||  (Math.abs(rotatedPhi-Math.PI/18) < Math.PI/300)) {
      //   writeData.data[to] = 0;
      //   writeData.data[to + 1] = 255;
      //   writeData.data[to + 2] = 0;
      //   writeData.data[to + 3] = 255;
      // }
      // else if (Math.abs(rotatedTheta+Math.PI/18) < Math.PI/300  ||  (Math.abs(rotatedPhi+Math.PI/18) < Math.PI/300)) {
      //   writeData.data[to] = 0;
      //   writeData.data[to + 1] = 0;
      //   writeData.data[to + 2] = 255;
      //   writeData.data[to + 3] = 255;
      // }
      // else if ((Math.abs(rotatedTheta) - Math.floor(Math.abs(rotatedTheta) / (Math.PI/18))*(Math.PI/18)) < Math.PI/300  ||  (Math.abs(rotatedPhi) - Math.floor(Math.abs(rotatedPhi) / (Math.PI/18))*(Math.PI/18)) < Math.PI/300) {
      //   writeData.data[to] = 0;
      //   writeData.data[to + 1] = 0;
      //   writeData.data[to + 2] = 0;
      //   writeData.data[to + 3] = 255;
      // }
      // else if (rotatedPhi < 0 || rotatedPhi > 2*Math.PI) {
      //   writeData.data[to] = 255;
      //   writeData.data[to + 1] = 0;
      //   writeData.data[to + 2] = 255;
      //   writeData.data[to + 3] = 255;
      // }
    }
  }

  // Once done, send the output image back to the main thread
  postMessage(writeData);
}

// This method is called whenever the main thread sends a message to this worker (using postMessage)
onmessage = function({data}) {
  render(data);
};


// Some unused utility functions

// function normalize(v) {
//   const norm = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
//   return {
//     x: v.x / norm,
//     y: v.y / norm,
//     z: v.z / norm
//   };
// }

// function crossProduct(a, b) {
//   return {
//     x: a.y*b.z - a.z*b.y,
//     y: a.z*b.x - a.x*b.z,
//     z: a.x*b.y - a.y*b.x
//   };
// }

// function dotProduct(a, b) {
//   return a.x*b.x + a.y*b.y + a.z*b.z;
// }

// function vectAdd(a, b) {
//   return {
//     x: a.x + b.x,
//     y: a.y + b.y,
//     z: a.z + b.z
//   };
// }

// function vectScalarMult(v, s) {
//   return {
//     x: v.x * s,
//     y: v.y * s,
//     z: v.z * s
//   };
// }

// function rotateVec(v, axis, angle) {
//   if (Math.sin(angle) !== 0) {
//     // Now rotate vector (https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula)
//     let rotatedVec = vectScalarMult(crossProduct(axis, v), Math.sin(angle));
//     rotatedVec = vectAdd(rotatedVec, vectScalarMult(v, Math.cos(angle)));
//     rotatedVec = vectAdd(rotatedVec, vectScalarMult(axis, dotProduct(axis, v)*(1-Math.cos(angle))));
//     return rotatedVec;
//   }
//   else return v;
// }