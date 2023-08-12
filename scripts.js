"use strict";

// for debugging
function dump(msg, active = true)
    {
//    if (active) // easier to switch debugging on/off
    if (false)
        {
        let e = document.createElement("code");
        e.innerText = msg + "\n";
        document.body.appendChild(e);
        }
    }

var timers = {};
function timer(name) 
    {
    timers[name + '_start'] = window.performance.now();
    }
function timerEnd(name) 
    {
    if (!timers[name + '_start']) return undefined;
    var time = window.performance.now() - timers[name + '_start'];
    var amount = timers[name + '_amount'] = timers[name + '_amount'] ? timers[name + '_amount'] + 1 : 1;
    var sum = timers[name + '_sum'] = timers[name + '_sum'] ? timers[name + '_sum'] + time : time;
    timers[name + '_avg'] = sum / amount;
    delete timers[name + '_start'];
    return time;
    }
function FRODEtime(name)
    {
    timer(name);    
    }
function FRODEtimeEnd(name)
    {
    dump(name+": "+timerEnd(name)+"\n");
    }
/// END OF DEBUG STUFF

/* Show error message in the GUI */
function showErrorMessage(errorID, detailedMessage = "")
    {
    // show the error message
    let errorMsg = document.getElementById(errorID);  
    errorMsg.hidden = false;
    let specificDetail = document.createElement("p");
    specificDetail.classList.add("errorMessageText");
    specificDetail.innerText = detailedMessage;
    errorMsg.appendChild(specificDetail);
    // show the sresubmit button
    document.getElementById("refreshButtonID").hidden = false;
    // hide other elements
    document.getElementById("processingStepID").hidden = true;
    document.getElementById("uploadButtonID").hidden = true;
    document.getElementById("footerID").hidden = true;
    }

// Bootstrapping
window.addEventListener('DOMContentLoaded', (event) => setup());
function setup()
    {
    // check that the jabascript libraries are loaded
    if (!opencvLoaded)
        {
        showErrorMessage("noOpenCVErrorID");        
        }
    }

const cap_image = document.getElementById("cap-image");
const pros_image = document.getElementById("pros-image");
const imtofrode = document.getElementById("canvasOutput");
let showImg = document.getElementById('imageSrc');
let inputElement = document.getElementById('fileInput');
let contour_scale = 20; // Minimum original image ratio
let THRESHOLD = 128; // Monochrome threshold
let origIm = document.getElementById('oIm');
let imtof, max_width, lineAngle, linewidth, lineheight, max_height, ratio, modifyTall_v, 
    modifyTall_h, Im_Ratio, min_width, min_height, succsessUploadSystem;

inputElement.addEventListener('change', async (e) => 
    {
    origIm.src = URL.createObjectURL(e.target.files[0]);            // bildet som skal behandles
    showImg.src = URL.createObjectURL(e.target.files[0]);        // bildet som skal vises til brukeren
    document.getElementById("processingStepID").hidden = false; // show the image
    // remove other stuff from interface
    document.getElementById("uploadButtonID").hidden = true;
    document.getElementById("footerID").hidden = true;
    });

origIm.onload = function ImProcess() 
    {
    dump("ENTER-ImProcess", false);
    FRODEtime("total");
    transform(origIm);
    dump("EXIT-ImProcess", false);
    };

window.addEventListener("resize", (event) => 
    {
    let i = Math.round(255/window.visualViewport.scale);
    dump(`resize event: scale ${window.visualViewport.scale}, h: ${window.innerHeight}, w: ${window.innerHeight}, i ${i}`);    
//    document.body.style.backgroundColor = `rgb(${i},${i},${i});`;
//    document.body.style.backgroundColor = `rgb(255,255,255);`;
//    document.getElementById("uploadButtonID").innerText = `resize event: scale ${window.visualViewport.scale}, h: ${window.innerHeight}, w: ${window.innerHeight}, i ${i}`;
    });

// detecting shring-zoom gestures, or rotation
let startPoints = null;    // used as state variable
let endPoints = null
document.addEventListener("touchstart", handleStart);
document.addEventListener("touchmove", handleMove);
document.addEventListener("touchend", handleEnd);
document.addEventListener("touchcancel", handleCancel);
let zoomInfo = document.getElementById("zoomInfoBox");
let contrastInfo = document.getElementById("contrastInfoBox");
let zoomValue = document.getElementById("zoomValue");
let contrastValue = document.getElementById("contrastValue");
let zooming = true; // state variable - defaults to zooming
let magicNumberContrast = 100;    // for sensitivity of contrast tuning
let magicNumberZoom = 100;  // sensitivity of zoom turning
function distanceAndAngleGesture(startPoints, endPoints)
    {
    // detect relative pinch
    let startX = startPoints[0].screenX - startPoints[1].screenX;
    let startY = startPoints[0].screenY - startPoints[1].screenY;
    let startDist = Math.hypot(startX, startY);
    let endX = endPoints[0].screenX - endPoints[1].screenX;
    let endY = endPoints[0].screenY - endPoints[1].screenY;
    let endDist = Math.hypot(endX, endY);
    let changePst = 100 * (endDist - startDist)/startDist;
    // detect angle
    let dotProd = startX * endX + startY * endY;
    let angle = 180 * Math.acos(dotProd/(startDist*endDist))/Math.PI;
    let crossProd = startX * startY - endX * endY;
    let direction =  180 * Math.asin(crossProd/(startDist*endDist))/Math.PI;
    angle = angle * direction / Math.abs(direction);
    // detect relative hand translation
    let firstFingerMoveX = startPoints[0].screenX - endPoints[0].screenX;
    let firstFingerMoveY = startPoints[0].screenY - endPoints[0].screenY;
    let secondFingerMoveX = startPoints[1].screenX - endPoints[1].screenX;
    let secondFingerMoveY = startPoints[1].screenY - endPoints[1].screenY;
    let translateX = magicNumberContrast * (firstFingerMoveX + secondFingerMoveX) / window.innerHeight; 
    let translateY = magicNumberContrast * (firstFingerMoveY + secondFingerMoveY) / window.innerHeight; 
    return {distanceChange:changePst, angle:angle, translateX:translateX, translateY: translateY};
    }
// return true if zooming is seemingly the most prominent, otherwise angle
function zoomMostProminent(measurement)
    {
    return (Math.abs(measurement.angle) > Math.abs(measurement.translateY))
    }
function handleStart(e)
    {
    let list = [...e.touches];
    if (list.length == 2)   // look for two touch points
        {
        zoomInfo.hidden = false;
        startPoints = list;   // rember the last two selected two points   
        }
    }
function handleMove(e)
    {
    let list = [...e.touches];
    if (list.length == 2)   // look for two touch points
        {
        endPoints = list;   // remember the last position of last two selected two points   
        let measurement = distanceAndAngleGesture(startPoints, endPoints);
        let newState = zoomMostProminent(measurement);
        if (newState !== zooming)
            {
            if (zooming)
                {
                zoomInfo.hidden = true;
                contrastInfo.hidden = false;
                }
            else    
                {
                zoomInfo.hidden = false;
                contrastInfo.hidden = true;    
                }
            zooming = newState;
            }            
        if (zooming)
            {
            zoomValue.innerText = Math.round(measurement.angle);
            }
        else
            {
            contrastValue.innerText = Math.round(measurement.translateY);
            }
        }
    }    
let contrast = 100; // basic value    
let inverted = false;
function handleEnd(e)
    {
    let list = [...e.touches];
    if (list.length == 0 /*&& startPoints !== null && endPoints !== null*/)
        {
        if (startPoints.length == 2 && endPoints.length == 2)       // only act if we have exactly two points at start and beginning
                {
                let measurement = distanceAndAngleGesture(startPoints, endPoints);
                if (measurement.translateX > 50)    // detect double swipe left gesture
                    {
                    location.reload();              // reload the application in browser
                    }
                else if (measurement.translateX < -50)  // detect double swipe right gesture 
                    {
                    let invertValue = inverted? 0: 100; // set up inversion
                    inverted = !inverted; // toggle
                    const root = document.querySelector(':root');
                    root.style.setProperty('--invert', `${invertValue}%`);
                    result.style.background = inverted? "black": "white";
                    }                    
                else if (zooming)
                    {
                    zoom += measurement.angle/magicNumberZoom; // damping the input a bit so it is not too dramatic (200 instead of 100%)
                    document.documentElement.style.setProperty('--scale-zoom', zoom);
                    }
                else
                    {
                    contrast += Math.round(measurement.translateY);
                    console.log("contrast trgger "+contrast);
                    const root = document.querySelector(':root');
                    root.style.setProperty('--contrast', `${contrast}%`);
                    }
            }
        zoomInfo.hidden = true;     // hide the window
        contrastInfo.hidden = true;
        startPoints = false;  // reset state
        endPoints = false;  // reset state
        zooming = true; // reset state, ready for next round
        }
    }
function handleCancel(e)
    {
    startPoints = false;  // reset state
    endPoints = false;  // reset state
    zooming = true; // reset state, ready for next round
    zoomInfo.hidden = true; // hide the info box
    contrastInfo.hidden = true;        
    }

// Her we will transfer target element in image (Max-contour in image) to new image then will apply projection
async function transform(src) 
    {
    FRODEtime("transform");
    dump("ENTER-transform", false);
    // empty div if new image uploaded
    result.innerHTML = '';
    let im = cv.imread(src);
    dump("image: "+im.cols+","+ im.rows+"\n");    
    saveIllustrativeImage(im, 'pros-image',"starting-image",false);    
    // Resize image dimensions if it's too big
    // when Tavle chooses av user subtraction
    // F.ground and B.ground use too much of memory therefor resize vi before
    if ((im.cols >= 1280 || im.rows >= 1280)) 
        {
        resizing(im, 1280);
        }
    if ((im.cols >= 1500 || im.rows >= 1500)) 
        {
        let half_Size = im.cols >= im.rows ? im.cols * 0.6 : im.rows * 0.55;
        resizing(im, half_Size);
        }
    let pts = findContoursVertices(im);                // for å få vertices (conners) points
    if (pts) 
        {
//        const transformedIm = transformImage(im, pts);     // transformere funnet contour til ny bildet (canvas)
        const {color:colorImage, grayscale:transformedIm} = transformImage(im, pts);
        FRODEtimeEnd("transform");   
        saveIllustrativeImage(transformedIm, 'pros-image',"transformed-image",false);        
        // Crop extra edges for transformed Image and resizing
        let cropIm;
        let cropImCol;
        if (transformedIm.cols > 1280 || transformedIm.rows > 1280) 
            {
            //resizing(transformedIm,920);
            let rect = new cv.Rect(30, 30, transformedIm.cols - 45, transformedIm.rows - 45);
            cropIm = transformedIm.roi(rect);
            cropImCol = colorImage.roi(rect);
            } 
        else 
            {
            let rect = new cv.Rect(20, 15, transformedIm.cols - 25, transformedIm.rows - 25);
            cropIm = transformedIm.roi(rect);
            cropImCol = colorImage.roi(rect);
            }
        saveIllustrativeImage(cropIm, 'pros-image',"cropped-border-transformed",false);               
        // Blur
        let blur_im = new cv.Mat();
        cv.medianBlur(cropIm, blur_im, 3);
        let medinaAngle = findlinesAngle(blur_im)  // to find out line angle
        // Rotate Image
        if (medinaAngle) 
            {
            imRotation(cropIm, medinaAngle);
            imRotation(cropImCol, medinaAngle);
            }
        saveIllustrativeImage(cropIm, 'pros-image',"blurred-and-rotated-transformed",false);        
        extractAllWords(cropIm, blur_im, cropImCol);             // Call Opencv projection
        transformedIm.delete();
        colorImage.delete();
        cropIm.delete();
        cropImCol.delete();
        blur_im.delete();      // Free Memory
        } 
    else 
        {
        showErrorMessage("noTextAreaErrorID");
        }
    dump("EXIT-transform", false);        
    }

// --------------- Rotation ------------------
function imRotation(im, angle) 
    {
    dump("ENTER-imRotation", false);
    let dsize = new cv.Size(im.cols, im.rows);
    let center = new cv.Point(im.cols / 2, im.rows / 2);
    let M = cv.getRotationMatrix2D(center, angle, 1);
    let s = new cv.Scalar(255, 255, 255, 255);
    cv.warpAffine(im, im, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, s);
    M.delete();
    dump("EXIT-imRotation", false);
    }

// -------------- Resizing Image -------------
function resizing(im, max_size) 
    {
    let width = im.cols, height = im.rows;
    if (width > height) 
        {
        height *= (max_size / width);           // Ratio
        width = max_size;
        } 
    else 
        {
        width *= (max_size / height);
        height = max_size;
        }
    let dsize = new cv.Size(width, height);
    cv.resize(im, im, dsize, 0, 0, cv.INTER_AREA);          // opencv Resizing
    }

// -------------- Get vertices of founded rectangle (contour) ------------
function findContoursVertices(im) 
    {
    dump("ENTER-findContoursVertices", false);
    FRODEtime("findContoursVertices");
    let maxCnt = findMaxCnt(im);                 // find Max-contour in image (Target Contour)
    let pts = new cv.Mat();
    let approx = new cv.Mat();
    let vertices = new cv.Mat();
    const epsilon = 0.02 * cv.arcLength(maxCnt, true) // maximum distance from contour to approximated contour
    cv.approxPolyDP(maxCnt, approx, epsilon, true);   //  Douglas-Peucker algorithm function to approximate the shape
    console.log("global vertices:",approx.size().height);
    if (approx.size().height === 4) 
        {// Keep if it is a rectangle
        // antallKanter = approx.size().height;
        modifyTall_v = 0;
        modifyTall_h = 0;
        pts = approx // Coordinates of the rectangle to be cut out (4 points)
        pts.convertTo(pts, cv.CV_32FC2);        // Convert Type
        // Set 'Pts' in new array 'sortPots' with X,Y coordinates to be easy for sorting By 'Y'
        let sortPots = [];
        for (let i = 0; i < 8; i += 2) 
            {
            sortPots.push({x: Math.round(pts.data32F[i]), y: Math.round(pts.data32F[i + 1])})
            }
        //  sort by y  coordinates to know which corner has been scanned first
        sortPots.sort(function (a, b) { return a.y - b.y; });

/// DRAW COUNTOURS SEPARATE - perhaps make routine later
/*let cntrIm = cv.Mat.zeros(im.rows, im.cols, cv.CV_8UC3);
let rectangleColor = new cv.Scalar(255, 0, 0);
for (let i = 0; i < 4; i++) {
cv.line(cntrIm, sortPots[i], sortPots[(i + 1) % 4], rectangleColor, 3, cv.LINE_AA, 0);
}
saveIllustrativeImage(cntrIm, 'pros-image',"DP-plotted",true);             
// need to clean up
cntrIm.delete();
*/
/// END DRAW COUNTOURS

/// DRAW COUNTOURS ON IMAGE - perhaps make routine later
/*cv.cvtColor(im, im, cv.COLOR_RGBA2RGB, 0);  // need this for colours to show
let rectangleColor = new cv.Scalar(0, 255, 0);
for (let i = 0; i < 4; i++) {
cv.line(im, sortPots[i], sortPots[(i + 1) % 4], rectangleColor, 7, cv.LINE_AA, 0);
}
saveIllustrativeImage(im, 'pros-image',"DP-plotted",true);             
*/
/// END DRAW COUNTOURS

        // Reset Sorted array in new object in form matrix 4 X 1
        let recPts = cv.matFromArray(4, 1, cv.CV_32FC2, 
            [
            sortPots[0].x, sortPots[0].y, sortPots[1].x, sortPots[1].y,
            sortPots[2].x, sortPots[2].y, sortPots[3].x, sortPots[3].y
            ]);
        checkshape(sortPots);           // To check whether the Max-Contour is horizontal or vertical (Ratio >= 1 or < 1)
        FRODEtimeEnd("findContoursVertices");
//// need to uncomment the return to trigger max rectangle.
        return modifyCorners(recPts);         // Sort Contour Vertices To Find Which vertices L.Top, R.Top,L.Bottom,R.B
        }
    // console.log(maxCntArea)
    // if Number of Vertices more than 4 then we Bounded Minimum rectangle and take vertices of rectangle.
//    if (true)// for triggering plot
    if (approx.size().height !== 4) 
        {
        let minRecrt = cv.minAreaRect(maxCnt)       // OpenCV Function Minimum Bounding Rectangle
        vertices = cv.RotatedRect.points(minRecrt);
        modifyTall_v = 25;                           // Numbers To Modify selected Vertices to approximation of contour
        modifyTall_h = 25;
        let rectangleColor = new cv.Scalar(255, 0, 0);
//        cv.cvtColor(im, im, cv.COLOR_RGBA2RGB, 0);  // need this for colours to show
        // Draw Minimum Bounding Rectangle
        for (let i = 0; i < 4; i++) 
            {
            cv.line(im, vertices[i], vertices[(i + 1) % 4], rectangleColor, 7, cv.LINE_AA, 0);
            }
        saveIllustrativeImage(im, 'pros-image',"minimum-bounding-rectangle",false);        
        // Rounding of number
        for (let i = 0; i < 4; i++) 
            {
            vertices[(i + 1) % 4];
            vertices[i].x = Math.round(vertices[i].x);
            vertices[i].y = Math.round(vertices[i].y);
            }
        //  sort by y  coordinates to know which corner has been scanned first
        vertices.sort(function (a, b) { return a.y - b.y; });
        // Rest in ny object av type data32F2 which is Matrix 4 X 1
        let recPts = cv.matFromArray(4, 1, cv.CV_32FC2, 
            [
            vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y, vertices[3].x, vertices[3].y
            ]);
        checkshape(vertices);
        return modifyCorners(recPts);
        }
    }

// --------------- Find Max-Contour in Image -------------
function findMaxCnt(im) 
    {
    dump("ENTER-findMaxCnt");
    FRODEtime("findMaxCnt");    
    // Image area
    const imRectArea = im.cols * im.rows //
    // Grayscale
    let im_gray = new cv.Mat();
    cv.cvtColor(im, im_gray, cv.COLOR_RGBA2GRAY, 0);
    saveIllustrativeImage(im_gray, 'pros-image',"grayscale",false);   
    // Blur
    let medianBlur_im = new cv.Mat();
    cv.medianBlur(im_gray, medianBlur_im, 13);
    saveIllustrativeImage(medianBlur_im, 'pros-image',"median-blur",false);       
    // Canny Edge Detection
    let cany_im = new cv.Mat();
    cv.Canny(medianBlur_im, cany_im, 60, 120, 3, false);
    saveIllustrativeImage(cany_im, 'pros-image',"canny-edge-detect",false);   
    // Threshold
    let threshold_im = new cv.Mat();
    //cv.adaptiveThreshold(im_gray, threshold_im, 255, cv.THRESH_BINARY, 81, 3);
    cv.threshold(im_gray, threshold_im, THRESHOLD, 255, cv.THRESH_BINARY);
    //cv.threshold(threshold_im, threshold_im,THRESHOLD, 255, cv.THRESH_BINARY);
    saveIllustrativeImage(threshold_im, 'pros-image',"threshold-from-gray",false);   
    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    // cv.morphologyEx(threshold_im, threshold_im, cv.MORPH_GRADIENT, M);   // Morph. Diff. between Opening and Closing
    let anchor = new cv.Point(-1, -1);
    // Morphological operator (Dilation of Edge Contour if case it not Connected Clearly)
    cv.dilate(cany_im, cany_im, M, anchor, 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());
    saveIllustrativeImage(cany_im, 'pros-image',"dillated",false);    
    // Contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();      // To Save Relation between Contours (Children/Parents) To Know More Click link
    // https://docs.opencv.org/3.4/da/d0a/tutorial_js_contours_hierarchy.html
    cv.findContours(cany_im, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE); // Take only parents Contours
    console.log("global contours:",contours.size());

/// DRAW COUNTOURS - perhaps make routine later
// ON SEPARATE IMAGE
/*let cntrIm = cv.Mat.zeros(cany_im.rows, cany_im.cols, cv.CV_8UC3);
// draw contours with random Scalar
for (let i = 0; i < contours.size(); ++i) {
    let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
                              Math.round(Math.random() * 255));
    cv.drawContours( cntrIm, contours, i, color, 3, cv.LINE_8, hierarchy, 100);
}
saveIllustrativeImage(cntrIm, 'pros-image',"max-contours-plotted",false);             
cntrIm.delete();*/
// ON IMAGE
// draw contours with random Scalar
/*let cntrIm2 = cv.Mat.zeros(im.rows, im.cols, cv.CV_8UC3);
let rectangleColor = new cv.Scalar(255, 255, 0);
cv.cvtColor(im, cntrIm2, cv.COLOR_RGBA2RGB, 0);  // need this for colours to show
for (let i = 0; i < contours.size(); ++i) {
    cv.drawContours(cntrIm2, contours, i, rectangleColor, 7, cv.LINE_8, hierarchy, 100);
}
saveIllustrativeImage(cntrIm2, 'pros-image',"max-contours-plotted-in-image",false);             
// need to clean up
cntrIm2.delete();*/
/// END DRAW COUNTOURS

    let maxCntArea = 0;
    let maxCnt = new cv.MatVector();
    for (let i = 0; i < contours.size(); ++i) 
        {
        let cnt = contours.get(i);
        let cntArea = cv.contourArea(cnt);
        let maxRectScale = parseInt(cntArea / imRectArea * 100); // How big is it compared to the original image (%)
        if (maxRectScale >= contour_scale) 
            {       // Choose only Contours which is make '20%' and over of Image Size
            if (cntArea > maxCntArea) 
                {
                maxCnt = cnt;
                maxCntArea = cntArea;
                }
            }
        }
    // in Case Couldn't find out max-Contour we us 'cv.RETR_CCOMP' To Take (children and parents)
    if (!maxCnt.size()) 
        {
        cv.findContours(threshold_im, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
        for (let i = 0; i < contours.size(); ++i) 
            {
            let cnt = contours.get(i);
            const cntArea = cv.contourArea(cnt);
            const maxRectScale = parseInt(cntArea / imRectArea * 100); // How big is it compared to the original image (%)
            if (maxRectScale >= contour_scale) 
                {// Filter by ratio to original image
                if (cntArea > maxCntArea) 
                    {
                    maxCnt = cnt;
                    maxCntArea = cntArea;
                    }
                }
            }
// FRODE - her er det bug- kalles uansett - kommeter ut i produksjon
  //      showErrorMessage("noTextAreaErrorID");
        }
    contours.delete();
    im_gray.delete();
    cany_im.delete();
    medianBlur_im.delete();
    hierarchy.delete();
    FRODEtimeEnd("findMaxCnt");    
    return maxCnt;
    }

function transformImage(im, fromPts) 
    {
    dump("ENTER-transformImage", false);
    FRODEtime("transformImage");
    let transformedIm = new cv.Mat();
    const rows = im.rows;
    const cols = im.cols;
    let toPts, M;
    let dsize = new cv.Size(cols, rows);
    if (ratio < 1) 
        {
        if (cols > rows) 
            {
            toPts = cv.matFromArray(4, 1, cv.CV_32FC2, 
                [
                0, 0, cols, 0, 0, rows, cols, rows
                ]);
            M = cv.getPerspectiveTransform(fromPts, toPts); // Matrix of transformations
            cv.warpPerspective(im, transformedIm, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
            saveIllustrativeImage(transformedIm, 'pros-image',"wapredPerspective1",false);             
            cv.rotate(transformedIm, transformedIm, cv.ROTATE_90_CLOCKWISE);
            //imRotation(transformedIm,-90)
            saveIllustrativeImage(transformedIm, 'pros-image',"tranformed-and-roptated1",false);             
            // check line orientation
            checkLineOrientation(transformedIm);
            if (ratio >= 1) 
                {
                modifyCorners(fromPts)
                }
            } 
        else 
            {
            toPts = cv.matFromArray(4, 1, cv.CV_32FC2, 
                [
                0, rows, 0, 0, cols, rows, cols, 0
                ]);
            M = cv.getPerspectiveTransform(fromPts, toPts); // Matrix of transformations
            cv.warpPerspective(im, transformedIm, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
            saveIllustrativeImage(transformedIm, 'pros-image',"warpedPerspective2",false);             
            cv.rotate(transformedIm, transformedIm, cv.ROTATE_90_CLOCKWISE);
            saveIllustrativeImage(transformedIm, 'pros-image',"tranformed-and-roptated2",false);             
            // check line orientation
            checkLineOrientation(transformedIm);
            if (ratio >= 1) 
                {
                modifyCorners(fromPts);
                }
            }
        }
    if (ratio >= 1) 
        {
        toPts = cv.matFromArray(4, 1, cv.CV_32FC2, 
            [
            0, 0, 0, rows, cols, 0, cols, rows
            ]);
        M = cv.getPerspectiveTransform(fromPts, toPts); // Matrix of transformations
        cv.warpPerspective(im, transformedIm, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
        saveIllustrativeImage(transformedIm, 'pros-image',"warpPerspctive3",false);                     
        }
    // we maintain two colies, one in processed grayscale for analysis, and one in color for viewing
    let transformedGrayscale = new cv.Mat();
    // Grayscale
    cv.cvtColor(transformedIm, transformedGrayscale, cv.COLOR_RGBA2GRAY, 0);
    saveIllustrativeImage(transformedGrayscale, 'pros-image',"grayscale",false);             
    // with low-res webcame cv.adaptiveThreshold(transformedGrayscale, transformedGrayscale, 250, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 13, 7);
    cv.adaptiveThreshold(transformedGrayscale, transformedGrayscale, 250, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 25, 7);
    saveIllustrativeImage(transformedGrayscale, 'pros-image',"adaptiveThreshold",false);             
    // Threshold
    cv.threshold(transformedGrayscale, transformedGrayscale, THRESHOLD, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    saveIllustrativeImage(transformedGrayscale, 'pros-image',"threshold",false);             
    // Blur
    let ksize = new cv.Size(3, 3);
    //cv.medianBlur(transformedIm, transformedIm, 3);
    // with webcam cv.GaussianBlur(transformedGrayscale, transformedGrayscale, ksize, 0, 0, cv.BORDER_DEFAULT);
    //cv.cvtColor(transformedIm,transformedIm, cv.COLOR_RGBA2RGB, 0);
    //cv.bilateralFilter(transformedIm, transformedIm, 9, 75, 50, cv.BORDER_DEFAULT);
    saveIllustrativeImage(transformedGrayscale, 'pros-image',"GaussianBlur",false);             
    fromPts.delete();
    toPts.delete();
    M.delete();
    im.delete();
    FRODEtimeEnd("transformImage");
    return {color:transformedIm, grayscale:transformedGrayscale};
    }

function getDistance(x1, y1, x2, y2) 
    {
    let x = x2 - x1;
    let y = y2 - y1;
    return Math.sqrt(x * x + y * y);
    }

// check if the Max-contour which founded in image is vertical or horizontal
function checkshape(pts) 
    {
    dump("ENTER-checkshape", false);
    let wt, wb, hl, hr;
    // Alle points sorted by Y coordinates when we scanned contours.
    wt = getDistance(pts[0].x, pts[0].y, pts[1].x, pts[1].y)
    if (pts[0].x < pts[1].x) 
        {                   // check position to x for first and second point
        if (pts[2].x > pts[3].x) 
            {             // check position to x for third and point forth point
            hl = getDistance(pts[0].x, pts[0].y, pts[3].x, pts[3].y);
            hr = getDistance(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
            } 
        else 
            {
            hl = getDistance(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
            hr = getDistance(pts[1].x, pts[1].y, pts[3].x, pts[3].y);
            }
        } 
    else 
        {
        if (pts[2].x < pts[3].x) 
            {
            hr = getDistance(pts[0].x, pts[0].y, pts[3].x, pts[3].y);
            hl = getDistance(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
            } 
        else 
            {
            hr = getDistance(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
            hl = getDistance(pts[1].x, pts[1].y, pts[3].x, pts[3].y);
            }
        }
    wb = getDistance(pts[2].x, pts[2].y, pts[3].x, pts[3].y)
    max_width = Math.max(wt, wb);
    max_height = Math.max(hl, hr);
    min_width = Math.min(wt, wb);        // Find Max Width
    min_height = Math.min(hl, hr);       // Find Max Height
    ratio = max_height / max_width;       // if 'Ratio' >= 1 Max-Contour is Vertical else it Horizontal if Not
    }

// -------------------- Check Line Orientation --------------------
// Find Text direction in contour to double-check whether the text in the same direction of contour direction
function checkLineOrientation(im) 
    {
    dump("ENTER-checkLineOrientation", false);
    FRODEtime("checkLineOrientation");    
    //Gray Scale
    let new_im = new cv.Mat();
    cv.cvtColor(im, new_im, cv.COLOR_RGBA2GRAY, 0);
    saveIllustrativeImage(new_im, 'pros-image',"grayscale-line-orientation",false);             
    //Blur
    // cv.medianBlur(new_im, new_im, 5);
    // canny edge detector
    cv.Canny(new_im, new_im, 30, 100, 3, false);
    //threshold
    //cv.threshold(new_im,new_im, THRESHOLD, 255, cv.THRESH_BINARY);
    saveIllustrativeImage(new_im, 'pros-image',"Canny-line-orientation",false);             
    let M;
    let ksize = new cv.Size(25, 20);
    M = cv.getStructuringElement(cv.MORPH_CROSS, ksize);
    cv.morphologyEx(new_im, new_im, cv.MORPH_GRADIENT, M);
    saveIllustrativeImage(new_im, 'pros-image',"morphologyEx-line-orientation",false);             
    // Contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    //cv.findContours(new_im, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    cv.findContours(new_im, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let MaxCntArea = im.cols * im.rows;
    let min_area = im.cols * im.rows * 0.001;
    let sannsynlighet_feil_ratio = 0, sannsynlighet_riktig_ratio = 0;
    for (let i = contours.size() / 2; i < contours.size() * 0.8; ++i) 
        {
        let cnt = contours.get(i);
        const cntArea = cv.contourArea(cnt);
        if (min_area < cntArea && cntArea < MaxCntArea) 
            {
            let rect = cv.boundingRect(cnt);
            let contoursColor = new cv.Scalar(255, 255, 255);
            let rectangleColor = new cv.Scalar(255, 0, 0);
            cv.drawContours(new_im, contours, 0, contoursColor, 1, 8, hierarchy, 100);
            let point1 = new cv.Point(rect.x, rect.y);
            let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
            cv.rectangle(new_im, point1, point2, rectangleColor, 2, cv.LINE_AA, 0);
            linewidth = rect.width;
            lineheight = rect.height;
            ratio = lineheight / linewidth;
            if (ratio >= 1) 
                {
                sannsynlighet_feil_ratio++;
                } 
            else 
                {
                sannsynlighet_riktig_ratio++;
                }
            }
        }
    saveIllustrativeImage(new_im, 'pros-image',"bounding-rectangles",false);        
    // Check if selected Ratio is right or fail
    sannsynlighet_riktig_ratio > sannsynlighet_feil_ratio ? ratio = -1 : ratio = 1;
    contours.delete();
    new_im.delete();
    FRODEtimeEnd("checkLineOrientation");    
    }

// --------------- Find Median Angle of Lines in Text -------------
function findlinesAngle(im) 
    {
    dump("ENTER-findlinesAngle", false);
    FRODEtime("findlinesAngle");     
    let dst = new cv.Mat();
    let M;
    let ksize = new cv.Size(25, 1);
    M = cv.getStructuringElement(cv.MORPH_CROSS, ksize);
    cv.morphologyEx(im, dst, cv.MORPH_GRADIENT, M);
    saveIllustrativeImage(dst, 'pros-image',"mophologyEx-line-angle",false);             
    // get bounding boxes to stand out, commentet out for performance reasons
    let lineIm = new cv.Mat();
    cv.cvtColor(dst, lineIm, cv.COLOR_RGBA2RGB, 0);  // need this for colours to show
    // Contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(dst, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    let minCntArea = 3000; // for å fjernet små brikker
    let imArea = (im.rows * im.cols) * 0.1;
    let sortertAngle = [];
    // let linesCntAngles;
    let rectArr = [];
    let medianAngle;
    let rectangleColor = new cv.Scalar(255, 0, 0);
    let contoursColor = new cv.Scalar(0, 255, 0);
    let rotatedRect;
    let vertices;
    for (let i = 0; i < contours.size(); ++i) 
        {
        let cnt = contours.get(i);
        const cntArea = cv.contourArea(cnt);
        if (cntArea > minCntArea && cntArea < imArea) 
            {
            rotatedRect = cv.minAreaRect(cnt);
            rectArr.push(rotatedRect);
            vertices = cv.RotatedRect.points(rotatedRect);
 //           cv.drawContours(lineIm, contours, 0, contoursColor, 1, 8, hierarchy, 100);
            //saveIllustrativeImage(lineIm, 'pros-image',"rotated-contours",true);             
            // draw rotatedRect
            for (let i = 0; i < 4; i++) 
                {
                cv.line(lineIm, vertices[i], vertices[(i + 1) % 4], rectangleColor, 5, cv.LINE_AA, 0);
                }
            vertices.sort((a, b) => a.y - b.y);
            if (rotatedRect.size.width > rotatedRect.size.height) 
                {
                // if line direction slightly skewed Up or straight For More info. see link
                // https://theailearner.com/tag/angle-of-rotation-by-cv2-minarearect/
                // https://namkeenman.wordpress.com/2015/12/18/open-cv-determine-angle-of-rotatedrect-minarearect/
                sortertAngle.push(rotatedRect.angle)
                } 
            else 
                {
                let angle = 180 - (-rotatedRect.angle + 90)          // if line direction slightly skewed down
                sortertAngle.push(angle)
                }
            }
        }
    saveIllustrativeImage(lineIm, 'pros-image',"rotated-rects",false);             
    lineIm.delete();  
    sortertAngle.sort((a, b) => a - b)
    medianAngle = sortertAngle.at(sortertAngle.length / 2);
    dst.delete();
    contours.delete(); // linesCntAngles=[]; sortertAngle=[]; rectArr=[]; vertices=[];
    FRODEtimeEnd("findlinesAngle");      
    return medianAngle;
    }

// --------------- Extract words based on morphology operator ----------
// params are the grayscale image im, blurred image_im, and full colour image imCol
function extractAllWords(im, blured_im, imCol) 
    {
    dump("ENTER-extractAllWords", false);
    FRODEtime("extractAllWords");  
    // pre Test to find out median width and height of characters in context
    // Contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(blured_im, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    let minCntArea = 20; // for å fjernet små brikker
    let imArea = (im.rows * im.cols) * 0.08;
    let charHorizentalDistanse = [];
    let charVerticalDistanse = [];
    let rectArr = [];
    let rectangleColor = new cv.Scalar(0, 255, 0);
    //let contoursColor = new cv.Scalar(0, 255,0);
    let lineIm = new cv.Mat();
    cv.cvtColor(im, lineIm, cv.COLOR_RGBA2RGB, 0);     
    for (let i = 0; i < contours.size() * 0.25; ++i) 
        {
        let r = Math.floor(Math.random() * contours.size());  // Randomize choose sample of width in different places
        let cnt = contours.get(r);
        const cntArea = cv.contourArea(cnt)

        if (cntArea > minCntArea && cntArea < imArea) 
            {
            let rect = cv.boundingRect(cnt)         
            let point1 = new cv.Point(rect.x, rect.y);
            let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
            let rectangleColor = new cv.Scalar(255, 0, 0);        
            cv.rectangle(lineIm, point1, point2, rectangleColor, 3, cv.LINE_AA, 0);            
            if (!charHorizentalDistanse.includes(rect.width)) 
                {
                charHorizentalDistanse.push(rect.width);
                }
            if (!charVerticalDistanse.includes(rect.height)) 
                {
                charVerticalDistanse.push(rect.height);
                }
            /*
                        rotatedRect = cv.minAreaRect(cnt);
                        //rectArr.push(rotatedRect);
                        vertices = cv.RotatedRect.points(rotatedRect);
                        //cv.drawContours(im, contours, 0, contoursColor, 1, 8, hierarchy, 100);
                        // draw rotatedRect
                        for (let i = 0; i < 4; i++) {
                            cv.line(im, vertices[i], vertices[(i + 1) % 4], rectangleColor, 2, cv.LINE_AA, 0);
                        }
                       // linesCntAngles.push(rotatedRect.angle)
                       // sortertAngle.push(rotatedRect.angle)
                       // console.log(rotatedRect.angle)
            */
            }
        }
    saveIllustrativeImage(lineIm, 'pros-image',"rectangles-inserted",false);             
    let cntrIm = cv.Mat.zeros(blured_im.rows, blured_im.cols, cv.CV_8UC3);
    // draw contours with random Scalar
    for (let i = 0; i < contours.size(); ++i) 
        {
        let color = new cv.Scalar(Math.round(Math.random() * 255), Math.round(Math.random() * 255),
                              Math.round(Math.random() * 255));
        cv.drawContours( cntrIm, contours, i, color, 1, cv.LINE_8, hierarchy, 100);
        }
//    cv.drawContours( cntrIm, contours, -1, rectangleColor, 1, cv.LINE_8, hierarchy, 100);
//    cv.drawContours( cntrIm, contours, -1, rectangleColor, 1);
    saveIllustrativeImage(cntrIm, 'pros-image',"contours-plotted",false);             
    // need to clean up
    lineIm.delete();
    cntrIm.delete();
    contours.delete();
    // NB: here we could select most high frequency of chars,but it will take long time and effect the performance.
    // Sort char based on width and height then select median of width and height
    charHorizentalDistanse.sort((a, b) => a - b);
    let horizentalCharSnitt = charHorizentalDistanse.at(charHorizentalDistanse.length / 2);
    charVerticalDistanse.sort((a, b) => a - b);
    let verticalCharSnitt = charVerticalDistanse.at(charVerticalDistanse.length / 2);
    let dst = new cv.Mat();
    // Apply Morph. to select lines in Context.
    let M;
    let ksize = new cv.Size(horizentalCharSnitt * 2, verticalCharSnitt * 0.2);
    M = cv.getStructuringElement(cv.MORPH_RECT, ksize);
    cv.morphologyEx(blured_im, dst, cv.MORPH_GRADIENT, M);
    saveIllustrativeImage(dst, 'pros-image',"morphologyEx-extractAllWords",false);             
    let lineIm2 = new cv.Mat();
    cv.cvtColor(im, lineIm2, cv.COLOR_RGBA2RGB, 0);     
    let conts = new cv.MatVector();
    let h = new cv.Mat();
    let min_Areal = horizentalCharSnitt * verticalCharSnitt;
    let max_Area = im.rows * im.cols * 0.2;
    cv.findContours(dst, conts, h, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < conts.size(); ++i) 
        {
        let cnt = conts.get(i);
        const cntArea = cv.contourArea(cnt)
        if (cntArea > min_Areal && cntArea < max_Area) 
            {
            let rect = cv.boundingRect(cnt);     // bounding lines with rectangles.            
            let point1 = new cv.Point(rect.x, rect.y);
            let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
            cv.rectangle(lineIm2, point1, point2, rectangleColor, 5, cv.LINE_AA, 0);            
            rectArr.push(rect);         // push lines (rect) to array
            /*
                        rotatedRect = cv.minAreaRect(cnt);
                        rectArr.push(rotatedRect);
                        vertices = cv.RotatedRect.points(rotatedRect);
                        //cv.drawContours(im, contours, 0, contoursColor, 1, 8, hierarchy, 100);
                        // draw rotatedRect
                        for (let i = 0; i < 4; i++) {
                            cv.line(im, vertices[i], vertices[(i + 1) % 4], rectangleColor, 2, cv.LINE_AA, 0);
                        }
            */
            }
        }
    saveIllustrativeImage(lineIm2, 'pros-image',"line-bounding-boxes",false);             
    lineIm2.delete();
    // Declare variables for splitting words. Find the median line height to represent the "typical".
    let heights = rectArr.map(({height}) => height)
                         .sort();
    let medianHeight = heights[Math.round(heights.length/2)];
    const cutHeightToWidthFactor = 8;      // the width of the cut points 
    const maxWordWidth = medianHeight * cutHeightToWidthFactor;
    let cutSegmentHalfwidth = 2*medianHeight;
    let cutSegmentWidth = 2 * cutSegmentHalfwidth; 
//let debug_case = 0;
    // Sort Line (rect) based on height 'Y'
    rectArr.sort((a, b) => a.y - b.y);
    for (let i = 0; i < rectArr.length; i++) 
        {
        let x = rectArr[i].x;
        let y = rectArr[i].y;
        let h = rectArr[i].height;
        let w = rectArr[i].width;
        let rect = new cv.Rect(x, y, w, h);
        let croped_rectIm = im.roi(rect);           // Crop Lines from Main Image
        let cropped_Col = imCol.roi(rect);           // Crop Lines from Main Image

        // Inserting the line into the web reflow framework from
//        cv.imshow('pros-image', croped_rectIm);   // based on grayscale image
        cv.imshow('pros-image', cropped_Col);   // based on color image
        cropped_Col.delete();   // do we need this one?
        // illustrate the middle line detected        
        if (i == Math.round(rectArr.length/2))
            {
            saveIllustrativeImage(croped_rectIm, 'pros-image',"example-middle-line", false);                    
            }
        let dst = new cv.Mat();
        let M = new cv.Mat();
        // Apply morphological on words in line based on median width and height to char we founded in text
        let ksize = new cv.Size(horizentalCharSnitt * 0.32, verticalCharSnitt * 0.2);
        M = cv.getStructuringElement(cv.MORPH_CROSS, ksize);
        cv.morphologyEx(croped_rectIm, dst, cv.MORPH_GRADIENT, M);
        let lineIm3 = new cv.Mat();
        cv.cvtColor(croped_rectIm, lineIm3, cv.COLOR_RGBA2RGB, 0); 
        //cv.cvtColor(dst, lineIm3, cv.COLOR_RGBA2RGB, 0);        
        // illustrate the middle line detected        
        if (i == Math.round(rectArr.length/2))
            {
            saveIllustrativeImage(dst, 'pros-image',"example-middle-line-morphology", false);                
            }        
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        let min_Areal = horizentalCharSnitt * verticalCharSnitt * 0.3;
        let max_Areal = w * h;
        let rectArrOrd = [];

        // Find Contours for alle words in lines and bounded with rectangles then
        // sort Words (rectangles) Based on 'X' in every line then Crop words (rectangles)
        cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        for (let j = 0; j < contours.size(); ++j) 
            {
            let cnt = contours.get(j);
            const cntArea = cv.contourArea(cnt);
            if (cntArea > min_Areal && cntArea <= max_Areal) 
                {
                let rect = cv.boundingRect(cnt);
                rect.y = 0; // because it is relative y-coordinate within the cropped line
                rect.height = h;
                let point1 = new cv.Point(rect.x, rect.y);
                let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
                cv.rectangle(lineIm3, point1, point2, rectangleColor, 5, cv.LINE_AA, 0);
                rectArrOrd.push(rect);
                // FRODES SPLIT WORD         
                if (rect.height < medianHeight * 4) // first check that it is not a huge illustration, but probably a text line
                    {                   
                    // traverse long words and split into segments
                    let cutSegmentStart = maxWordWidth - cutSegmentHalfwidth;
                    while (cutSegmentStart < rect.width - cutSegmentWidth)
                        {
//            console.log("start rect: "+(++debug_case));                        
//            console.log(rect);                                 
//            console.log("cutSegment start "+cutSegmentStart);                             
                        // split up the word in smaller pieces
                        // first try to get the vertical projections using opencv.js
                        let cutSegment = { ...rect, x: cutSegmentStart, width: cutSegmentWidth};       // clone the rectangle, and alter properties
                        let col_sum = new cv.Mat();
                        let line = new cv.Mat();
//    line = croped_rectIm.roi(rect);
//    saveIllustrativeImage(line, 'debugCanvas',debug_case+"longword",true);             
                    
//    line = croped_rectIm.roi(cutSegment);
//    saveIllustrativeImage(line, 'debugCanvas',debug_case+"split",true);    
//    console.log(cutSegment);         
                        line = croped_rectIm.roi(cutSegment);                        
                        cv.reduce(line, col_sum, 0, cv.REDUCE_SUM, cv.CV_32F);
    //console.log("col_sum: "+col_sum.data32F.length);
//    console.log(col_sum.data32F);
                        // find the smallest value in the projection, and use as cut point
                        let projection = col_sum.data32F; 
                        let minIndex = projection.reduce((index, value, i, array) =>
                                                value < array[index] ? i : index, 0);
//console.log("minindex "+minIndex +" with "+projection[minIndex]);;
                        let cutPoint = cutSegmentStart + minIndex;
//                    console.log("cut point "+cutPoint);
                        // split up
//                        let segmentWidth = medianHeight * cutHeightToWidthFactor;
                        let rect1 = {x : rect.x, y : rect.y, width : cutPoint - rect.x - 1, height : rect.height};
                        let rect2 = {x : cutPoint, y : rect.y, width : rect.width - rect1.width, height : rect.height};                       
                        if (rect2.width > 0)    // dont insert empty end pieces
                            {
                            // replace the old rect with the two new ones to achieve split
                            rectArrOrd.pop();   // remove old
//                    console.log("   replaced rect 1:");                        
//                    console.log(rect1);                        
                            rectArrOrd.push(rect1);
//                    console.log("   replaced rect 2:");                        
//                    console.log(rect2);                        
                            rectArrOrd.push(rect2);

//    line = croped_rectIm.roi(rect1);
//    saveIllustrativeImage(line, 'debugCanvas',debug_case+"del-1",true);             
//    line = croped_rectIm.roi(rect2);
//    saveIllustrativeImage(line, 'debugCanvas',debug_case+"del-2",true);             
            
                            }
                        cutSegmentStart = cutPoint + maxWordWidth - cutSegmentHalfwidth; // update for next iteration 

                        rect = rect2;       // continue analysing the second word, in case that needs to be split further
//console.log("End case: "+cutSegmentStart+" < "+ rect.width);                        
                        col_sum.delete();   // cleanup
                        line.delete();
                        }  
console.log("exited long word loop");                          
                    }                    
                // END SPLIT WORD
                }
            }

        // illustrate the middle line detected        
        if (i == Math.round(rectArr.length/2))
            {
            saveIllustrativeImage(lineIm3, 'pros-image',"example-middle-line-word-box", false);               
            }    
        // sort row by x;
        rectArrOrd.sort((a, b) => a.x - b.x);       // Sort Rectangles (Words) in line
        cropImage(rectArrOrd);                               // Crop Words (Rectangle)
        rectArrOrd = [];                                     // Free Memory
        lineIm3.delete();        
        }
    dump("no words detected: "+document.getElementsByTagName("canvas").length+"\n");    
    FRODEtimeEnd("extractAllWords");  
    // remove other stuff from interface
    document.getElementById("processingStepID").hidden = true;
    // add the reload button
    document.getElementById("refreshButtonID").hidden = false;
    FRODEtimeEnd("total");    
    }

// -------------------- Crop Words in Lines --------------------
function cropImage(wordCoordinates) 
    {
    const ctx = pros_image.getContext("2d");
    let capCtx;
    for (let word of wordCoordinates) 
        {
        let x, y, h, w, wordImage;
        // coordinates from Opencv-Projection method ( from extractAllWords())
        x = word.x;
        y = word.y;
        w = word.width;
        h = word.height;
        // get the image of the current word
        wordImage = ctx.getImageData(x, y, w, h);
        // create temporary canvas for word
        const newWordCanvas = document.createElement("canvas");
        newWordCanvas.setAttribute("name", "clipWord")
        newWordCanvas.width = w;   // set the canvas equal to the word dimensions.
        newWordCanvas.height = h;
        newWordCanvas.classList.add("wordStyle");   // allow us to modify the appearance in real time using css image processing functions
        // draw the word on the new canvas
        const wordCtx = newWordCanvas.getContext("2d");
        wordCtx.putImageData(wordImage, 0, 0);
        // add the word to the assigned part of the page
        result.appendChild(newWordCanvas)
        }
    }


// ---------------------- Modify and Select corner coordinates ------------------------------
function modifyCorners(pts) 
    {
    let max_sum = pts.data32F[0] + pts.data32F[1];
    let min_sum = pts.data32F[0] + pts.data32F[1];
    let max_diff = Math.abs(pts.data32F[0] - pts.data32F[1]);
    let min_diff = Math.abs(pts.data32F[0] - pts.data32F[1]);
    let rect = [];
    for (let i = 0; i < pts.data32F.length; i += 2) 
        {
        let new_sum = pts.data32F[i] + pts.data32F[i + 1];
        let new_diff = pts.data32F[i] - pts.data32F[i + 1];
        if (new_sum >= max_sum) 
            {
            max_sum = new_sum;
            // Top left point
            rect[6] = pts.data32F[i]
            rect[7] = pts.data32F[i + 1]
            }
        if (new_sum <= min_sum) 
            {
            min_sum = new_sum;
            // bottom right point
            rect[0] = pts.data32F[i]
            rect[1] = pts.data32F[i + 1]
            }
        if (new_diff >= max_diff) 
            {
            max_diff = new_diff;
            // bottom left point
            if (ratio >= 1) 
                {
                rect[4] = pts.data32F[i]
                rect[5] = pts.data32F[i + 1]
                } 
            else 
                {
                rect[2] = pts.data32F[i]
                rect[3] = pts.data32F[i + 1]
                }
            }
        if (new_diff <= min_diff) 
            {
            min_diff = new_diff;
            //Top right point
            if (ratio >= 1) 
                {
                rect[2] = pts.data32F[i]
                rect[3] = pts.data32F[i + 1]
                } 
            else 
                {
                rect[4] = pts.data32F[i]
                rect[5] = pts.data32F[i + 1]
                }
            }
        }
    for (let i = 0; i < rect.length; i++) 
        {
        pts.data32F[i] = rect[i];
        }
    // Crop Max-Contour by shrinking vertices to inside
    if (ratio < 1) 
        {
        pts.data32F[0] += modifyTall_h;
        pts.data32F[1] += modifyTall_h;
        pts.data32F[2] -= modifyTall_h;
        pts.data32F[3] += modifyTall_h;
        pts.data32F[4] += modifyTall_h;
        pts.data32F[5] -= modifyTall_h;
        pts.data32F[6] -= modifyTall_h;
        pts.data32F[7] -= modifyTall_h;
        }
    if (ratio >= 1) 
        {
        pts.data32F[0] += modifyTall_v;
        pts.data32F[1] += modifyTall_v;
        pts.data32F[2] += modifyTall_v;
        pts.data32F[3] -= modifyTall_v;
        pts.data32F[4] -= modifyTall_v;
        pts.data32F[5] += modifyTall_v;
        pts.data32F[6] -= modifyTall_v;
        pts.data32F[7] -= modifyTall_v;
        }
    return pts;
    }

let zoom = 1;

// for debug - comment this to avoid the plotting
let figureNo = 1000;    // large number to ensure the numbers are sortable and aligned, and easier to read
function saveIllustrativeImage(image, canvasName, fileName, active = true)
    {
    if (!active)    // if false, then the debug is temporarily removed, but still counted to keep track, different from uncommenting.
        {
        ++figureNo;            
        return;            
        }
    console.log("About to save " + fileName);
    cv.imshow(canvasName, image);
    var canvas = document.getElementById(canvasName);
    canvas.toBlob(function(blob) 
        {
        saveAs(blob, (++figureNo) + "-" + fileName + ".png");
        });   
    }