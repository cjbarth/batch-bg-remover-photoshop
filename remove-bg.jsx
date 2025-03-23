/*------------------------------------------------------------------------------------
This scripts is created by Kavindu Pasan Kavithilaka
on 2020-03-15
updated on 2020-12-13

Updated on 2021-10-30 by Chris Barth <chrisjbarth@hotmail.com>
Has been adjusted to focus on support for high-quality background removal to
transparent PNG target file.

This scripts supports Photoshop CC 2020 and above versions.
How to use the script: https://youtu.be/6ICVsi2pWyk

This script will only run on Windows.

Before running this script, please check `Preferences > Image Processing` to make sure
that you are in the desired mode; `Cloud` and `More stable` are recommended.

Also, if you are going to include the source hash in the target image, make sure
ExifTool and Python 3 is installed in your path so you you manage image metadata correctly.
https://exiftool.org/
--------------------------------------------------------------------------------------*/

// enable double clicking from Windows Explorer
#target photoshop

// in case we double clicked the file
app.bringToFront();

// Due to a limitation of ExtendScript, we need to set the temp folder to something not on the C: drive
var tempFolder;

var sourceFiles = /\.(jpg|jpeg|png|tif|psd|crw|cr2|nef|dcr|dc2|raw|heic)$/i;

// If you are going to use this make sure that `python3` and `exiftool` are in your PATH
var shouldIncludeSourceHash = true;

// Variables to set for cropping an image
var shouldCrop = true;
var cropWidth = 7680; // 8k resolution
var cropHeight = 4320; // 8k resolution
var cropBorder = 20;

// Variables to set for saving a downsampled webp image
var shouldSaveWebp = false;
var webpResolutions = [1200, 600, 300];

// Variables to set for saving a PNG-8 image
var shouldSavePng8 = false;

// If you'd like to auto-balance the image, set the following to true
var shouldAutoBalanceBeforeRemoveBackground = false;
var shouldAutoBalanceAfterRemoveBackground = true;

function main() {
  removeSubstDriveLetters();

  // Check for the existence of the temp file
  var tempFilePath = Folder.temp + "/psFilePaths.txt";
  var tempFile = new File(tempFilePath);
  var fileList = [];

  if (tempFile.exists) {
    tempFile.open("r");
    while (!tempFile.eof) {
      var line = tempFile.readln();
      if (line) {
        fileList.push(line);
      }
    }
    tempFile.close();
    tempFile.remove();
  } else {
    var sourceFolder = getRootFolder();

    if (sourceFolder == null) {
      alert("No source folder selected. Processing open file...");
      processOpenFile();
      return;
    }

    fileList = getFiles(sourceFolder);
  }

  // var sourceDriveLetter = mapNextAvailableDriveLetter(sourceFolder.fsName);
  // sourceFolder = new Folder(sourceDriveLetter + ":");

  var mappedDrive = mapNextAvailableDriveLetter("C:\\");
  for (var i = 0; i < fileList.length; i++) {
    // Case-insensitive replacement for the drive letter
    fileList[i] = fileList[i].toString().replace(/^c:/i, mappedDrive + ":");
  }

  // Remap the temp folder to a different drive letter
  tempDriveLetter = mapNextAvailableDriveLetter(Folder.temp.fsName) + ":";
  tempFolder = new Folder(tempDriveLetter);
  tempFolder.changePath("ps_temp_" + generateUniqueIdentifier());
  if (!tempFolder.exists) {
    tempFolder.create();
  }

  processFiles(fileList, "Processed_PS", "Processed_PS_Web");

  tempFolder.remove();
  removeSubstDriveLetters();

  alert("All images processed successfully");
}

function generateUniqueIdentifier() {
  var now = new Date();
  var year = now.getFullYear().toString();
  var month = (now.getMonth() + 1).toString();
  var day = now.getDate().toString();
  var hours = now.getHours().toString();
  var minutes = now.getMinutes().toString();
  var seconds = now.getSeconds().toString();
  var milliseconds = now.getMilliseconds().toString();

  // Manually pad the values with leading zeros if necessary
  month = month.length < 2 ? "0" + month : month;
  day = day.length < 2 ? "0" + day : day;
  hours = hours.length < 2 ? "0" + hours : hours;
  minutes = minutes.length < 2 ? "0" + minutes : minutes;
  seconds = seconds.length < 2 ? "0" + seconds : seconds;

  // Manually repeat '0' for milliseconds
  while (milliseconds.length < 3) {
    milliseconds = "0" + milliseconds;
  }

  return year + month + day + hours + minutes + seconds + milliseconds;
}

function init() {
  // Polyfills for ES3 ExtendScript
  /**
   * String.prototype.trim() polyfill
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/Trim#Polyfill
   */
  if (!String.prototype.trim) {
    String.prototype.trim = function () {
      return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
    };
  }

  /**
   * String.prototype.includes() polyfill
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes#Polyfill
   */
  if (!String.prototype.includes) {
    String.prototype.includes = function (search, start) {
      "use strict";
      if (typeof start !== "number") {
        start = 0;
      }

      if (start + search.length > this.length) {
        return false;
      } else {
        return this.indexOf(search, start) !== -1;
      }
    };
  }

  // Load Libraries
  if (ExternalObject.AdobeXMPScript == undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
}

/**
 * Configure following parameters before running the script
 */
function getRootFolder() {
  var sourceFolder = Folder.selectDialog("Please select the input folder:");

  return sourceFolder;
}

function getFiles(sourceFolder) {
  if (sourceFolder != null) {
    var fileList = sourceFolder.getFiles(sourceFiles);
  } else {
    alert("No images found in source folder.");
  }

  return fileList || [];
}

function processFiles(fileList, saveFolderName, saveWebFolderName) {
  for (var a = 0; a < fileList.length; a++) {
    var sourceFile = new File(fileList[a]);
    var baseFileName = sourceFile.displayName.replace(/\.[^\.]+$/, "");
    var parentFolderPath = sourceFile.parent.fsName;

    // Constructing save folders based on the parent folder of the source file
    var saveFolder = new Folder(parentFolderPath + "/" + saveFolderName);
    if (!saveFolder.exists) {
      saveFolder.create();
    }

    var saveWebFolder = new Folder(parentFolderPath + "/" + saveWebFolderName);
    if (!saveWebFolder.exists && (shouldSavePng8 || shouldSaveWebp)) {
      saveWebFolder.create();
    }

    var targetFileName = baseFileName + ".png";
    var targetFile = new File(saveFolder + "/" + targetFileName);

    var embeddedHash = getEmbeddedImageHash(targetFile).trim();
    var currentHash = calcImageHash(sourceFile).trim();

    // Skip processing if the hashes match
    if (embeddedHash && embeddedHash === currentHash) {
      continue;
    }

    app.open(sourceFile);

    imageHash = calcImageHash(sourceFile);

    processOpenFile();

    savePngImage(targetFile, imageHash);
    if (shouldSavePng8) {
      savePng8Image(saveWebFolder, targetFileName, imageHash);
    }
    if (shouldSaveWebp) {
      saveWebpImages(saveWebFolder, baseFileName, webpResolutions, imageHash);
    }

    app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
  }
}

function processOpenFile() {
  if (shouldAutoBalanceBeforeRemoveBackground) {
    autoTone();
    autoContrast();
    autoColor();
  }

  removeBackground();

  if (shouldAutoBalanceAfterRemoveBackground) {
    autoTone();
    autoContrast();
    autoColor();
  }

  if (shouldCrop) {
    cropImage(cropWidth, cropHeight, cropBorder);
  }
}

function removeBackground() {
  // Select subject
  var idAutoCutout = stringIDToTypeID("autoCutout");
  var desc01 = new ActionDescriptor();
  var idSampleAllLayers = stringIDToTypeID("sampleAllLayers");
  desc01.putBoolean(idSampleAllLayers, false);
  try {
    executeAction(idAutoCutout, desc01, DialogModes.NO);
  } catch (err) {}

  var doc = app.activeDocument;

  // Make active layer a normal layer.
  doc.activeLayer.isBackgroundLayer = false;
  var baseLayer = doc.activeLayer;

  // Cut the selection to a new layer
  var idCtTL = charIDToTypeID("CtTL");
  executeAction(idCtTL, undefined, DialogModes.NO);

  // Save the layer with the object
  activeLayer = doc.activeLayer;

  // Select the base layer
  doc.activeLayer = baseLayer;

  // Do it this way instead of `doc.selection.clear()` to avoid an error when there is no selection
  // and to allow GIMP anti-erase to work
  makeActiveLayerTransparent(0.0);

  // Reset the active layer to the top one so that image correction will work correctly
  doc.activeLayer = activeLayer;
}

function makeActiveLayerTransparent(transparency) {
  var idsetd = charIDToTypeID("setd");
  var desc53 = new ActionDescriptor();
  var idnull = charIDToTypeID("null");
  var ref3 = new ActionReference();
  var idLyr = charIDToTypeID("Lyr ");
  var idOrdn = charIDToTypeID("Ordn");
  var idTrgt = charIDToTypeID("Trgt");
  ref3.putEnumerated(idLyr, idOrdn, idTrgt);
  desc53.putReference(idnull, ref3);
  var idT = charIDToTypeID("T   ");
  var desc54 = new ActionDescriptor();
  var idOpct = charIDToTypeID("Opct");
  var idPrc = charIDToTypeID("#Prc");
  desc54.putUnitDouble(idOpct, idPrc, transparency);
  var idLyr = charIDToTypeID("Lyr ");
  desc53.putObject(idT, idLyr, desc54);
  executeAction(idsetd, desc53, DialogModes.NO);
}

function cropImage(maxResWidth, maxResHeight, border) {
  var doc = app.activeDocument;

  // Auto-crop the image to remove excess transparent space
  doc.trim(TrimType.TRANSPARENT, true, true, true, true);

  // Expand the canvas size
  var currentWidth = doc.width.value;
  var currentHeight = doc.height.value;
  doc.resizeCanvas(
    currentWidth + border * 2,
    currentHeight + border * 2,
    AnchorPosition.MIDDLECENTER
  );

  var currentWidth = doc.width.value;
  var currentHeight = doc.height.value;

  // Check if the document dimensions exceed resolution
  if (currentWidth > maxResWidth || currentHeight > maxResHeight) {
    var scaleFactor = Math.min(
      maxResWidth / currentWidth,
      maxResHeight / currentHeight
    );

    var newWidth = currentWidth * scaleFactor;
    var newHeight = currentHeight * scaleFactor;

    doc.resizeImage(newWidth, newHeight);
  }
}

function savePngImage(pngOutFile, sourceHash) {
  var doc = app.activeDocument;

  pngSaveOptions = new PNGSaveOptions();
  pngSaveOptions.compression = 2;

  doc.saveAs(pngOutFile, pngSaveOptions, true, Extension.LOWERCASE);

  if (sourceHash !== "") {
    addXmpToFile({ file: pngOutFile, key: "SourceHash", value: sourceHash });
  }
}

function savePng8Image(saveFolder, fileName, sourceHash) {
  var doc = app.activeDocument;

  var saveForWeb = new ExportOptionsSaveForWeb();
  saveForWeb.format = SaveDocumentType.PNG;
  saveForWeb.PNG8 = true;
  saveForWeb.transparency = true;
  saveForWeb.colors = 256; // Maximum number of colors for PNG-8

  pngOutFile = new File(saveFolder);
  pngOutFile.changePath(fileName);

  doc.exportDocument(pngOutFile, ExportType.SAVEFORWEB, saveForWeb);

  if (sourceHash !== "") {
    addXmpToFile({ file: pngOutFile, key: "SourceHash", value: sourceHash });
  }
}

function saveWebpImages(saveWebFolder, baseFileName, resolutions, sourceHash) {
  var doc = app.activeDocument;

  for (var i = 0; i < resolutions.length; i++) {
    var resolution = resolutions[i];
    var webpOutFile = new File(saveWebFolder);
    webpOutFile.changePath(baseFileName + "_" + resolution + "px.webp");

    var originalRatio = doc.width / doc.height;
    var newWidth, newHeight;

    if (originalRatio > 1) {
      newWidth = resolution;
      newHeight = resolution / originalRatio;
    } else {
      newWidth = resolution * originalRatio;
      newHeight = resolution;
    }

    doc.resizeImage(newWidth, newHeight);

    saveAsWebp({ file: webpOutFile, asCopy: true, asLossy: true });

    if (sourceHash !== "") {
      addXmpToFile({ file: webpOutFile, key: "SourceHash", value: imageHash });
    }

    // Undo the resize to get back to the original dimensions for the next iteration
    doc.activeHistoryState = doc.historyStates[doc.historyStates.length - 2];
  }
}

function saveAsWebp(options) {
  options = {
    file: options.file || null,
    compValue: options.compValue || 90,
    includeXmpData: options.includeXmpData || false,
    includeExifData: options.includeExifData || false,
    includePsData: options.includePsData || false,
    asCopy: options.asCopy || false,
    asLossy: options.asLossy || false,
  };

  if (!(options.file instanceof File)) {
    throw new Error("The `file` option must be a `File` instance.");
  }

  var desc297 = new ActionDescriptor();
  var idCmpr = charIDToTypeID("Cmpr");
  var idWebPCompression = stringIDToTypeID("WebPCompression");
  if (options.asLossy === true) {
    var idCompression = stringIDToTypeID("compressionLossy");
  } else {
    var idCompression = stringIDToTypeID("compressionLossless");
  }
  desc297.putEnumerated(idCmpr, idWebPCompression, idCompression);

  var idQlty = charIDToTypeID("Qlty");
  desc297.putInteger(idQlty, options.compValue);

  var idIncludeXMPData = stringIDToTypeID("includeXMPData");
  desc297.putBoolean(idIncludeXMPData, options.includeXmpData);

  var idIncludeEXIFData = stringIDToTypeID("includeEXIFData");
  desc297.putBoolean(idIncludeEXIFData, options.includeExifData);

  var idIncludePsExtras = stringIDToTypeID("includePsExtras");
  desc297.putBoolean(idIncludePsExtras, options.includePsData);

  var desc296 = new ActionDescriptor();
  var idAs = charIDToTypeID("As  ");
  var idWebPFormat = stringIDToTypeID("WebPFormat");
  desc296.putObject(idAs, idWebPFormat, desc297);

  var idIn = charIDToTypeID("In  ");
  desc296.putPath(idIn, options.file);

  var idDocI = charIDToTypeID("DocI");
  desc296.putInteger(idDocI, 59);

  var idCpy = charIDToTypeID("Cpy ");
  desc296.putBoolean(idCpy, options.asCopy);

  var idLwCs = charIDToTypeID("LwCs");
  desc296.putBoolean(idLwCs, true);

  var idSaveStage = stringIDToTypeID("saveStage");
  var idSaveStageType = stringIDToTypeID("saveStageType");
  var idSaveBegin = stringIDToTypeID("saveBegin");
  desc296.putEnumerated(idSaveStage, idSaveStageType, idSaveBegin);

  var idSave = charIDToTypeID("save");
  executeAction(idSave, desc296, DialogModes.NO);
}

function addXmpToFile(options) {
  var uniqueId = generateUniqueIdentifier();

  options = {
    file: options.file || null,
    key: options.key || null,
    value: options.value || null,
  };

  if (!(options.file instanceof File)) {
    throw new Error("The `file` option must be a `File` instance.");
  }
  if (options.key === null) {
    throw new Error("The `key` option must be set.");
  }
  if (options.value === null) {
    throw new Error("The `value` option must be set.");
  }

  // Define configuration content
  var configContent = "\
%Image::ExifTool::UserDefined = ( \
  'Image::ExifTool::XMP::xmp' => {\
      ${key} => {\
        Writable => 'string',\
        Groups => {\
          2 => 'Image'\
        },\
        Notes => 'Source image hash',\
        Avoid => 1,\
       },\
  },\
);\
1;  #end".replace("${key}", options.key);

  // Create temporary configuration file
  var configFile = new File(tempFolder);
  configFile.changePath("temp_" + uniqueId + ".config");
  configFile.open("w");
  configFile.write(configContent);
  configFile.close();

  var command =
    'exiftool -config "${configFile}" -overwrite_original -${key}="${value}" "${outFile}"';
  var command = command.replace("${configFile}", configFile.fsName);
  var command = command.replace("${key}", options.key);
  var command = command.replace("${value}", options.value);
  var command = command.replace("${outFile}", options.file.fsName);

  var result = runCommandSilently(command);
}

function calcImageHash(file) {
  var uniqueId = generateUniqueIdentifier();

  var tempFile = new File(tempFolder);
  tempFile.changePath("hash_" + uniqueId + ".txt");

  // NOTE: With ExtendScript, you can't chain method calls
  var command =
    'python -c "' +
    "from PIL import Image; " +
    "import hashlib; " +
    "img = Image.open(r'${inFile}');" +
    "print(hashlib.sha256(img.tobytes()).hexdigest())" +
    '" > ${outFile}';
  command = command.replace("${inFile}", file.fsName);
  command = command.replace("${outFile}", tempFile.fsName);

  // NOTE: With ExtendScript, a call to `app.system()` will remove all line breaks
  var result = runCommandSilently(command);

  var hash = "";

  if (result === 0 && tempFile.open("r")) {
    hash = tempFile.read();
    hash = hash.trim();
    tempFile.close();
  }

  return hash;
}

function getEmbeddedImageHash(file) {
  var uniqueId = generateUniqueIdentifier();

  var tempFile = new File(tempFolder);
  tempFile.changePath("hash_output_" + uniqueId + ".txt");

  var command =
    'exiftool -SourceHash "' + file.fsName + '" > "' + tempFile.fsName + '"';
  var result = runCommandSilently(command);

  var embeddedHash = "";

  if (result === 0 && tempFile.open("r")) {
    var output = tempFile.read().split(" ");
    embeddedHash = output[output.length - 1];
    tempFile.close();
  }

  return embeddedHash;
}

function autoTone() {
  try {
    var idLvls = charIDToTypeID("Lvls");
    var desc232 = new ActionDescriptor();
    var idAuto = charIDToTypeID("Auto");
    desc232.putBoolean(idAuto, true);
    executeAction(idLvls, desc232, DialogModes.NO);
  } catch (err) {
    if (!err.description.includes("is not currently available")) {
      throw err;
    }
  }
}

function autoContrast() {
  try {
    var idLvls = charIDToTypeID("Lvls");
    var desc256 = new ActionDescriptor();
    var idAuCo = charIDToTypeID("AuCo");
    desc256.putBoolean(idAuCo, true);
    executeAction(idLvls, desc256, DialogModes.NO);
  } catch (err) {
    if (!err.description.includes("is not currently available")) {
      throw err;
    }
  }
}

function autoColor() {
  try {
    var idLvls = charIDToTypeID("Lvls");
    var desc263 = new ActionDescriptor();
    var idAutoBlackWhite = stringIDToTypeID("autoBlackWhite");
    desc263.putBoolean(idAutoBlackWhite, true);
    var idAutoNeutrals = stringIDToTypeID("autoNeutrals");
    desc263.putBoolean(idAutoNeutrals, true);
    executeAction(idLvls, desc263, DialogModes.NO);
  } catch (err) {
    if (!err.description.includes("is not currently available")) {
      throw err;
    }
  }
}

function runCommandSilently(cmd) {
  var uniqueId = generateUniqueIdentifier();

  var batchFile = new File(tempFolder);
  batchFile.changePath("cmd_" + uniqueId + ".bat");

  var flagFile = new File(tempFolder);
  flagFile.changePath("flag_" + uniqueId + ".tmp");

  var runnerFile = new File(tempFolder);
  runnerFile.changePath("runner_" + uniqueId + ".vbs");

  runnerFile.open("w");
  runnerFile.writeln('Set WshShell = CreateObject("WScript.Shell")');
  runnerFile.writeln('WshShell.Run "' + batchFile.fsName + '", 0, True'); // 0 to hide the window
  runnerFile.close();

  batchFile.open("w");
  batchFile.writeln(cmd);
  batchFile.writeln('echo %ERRORLEVEL% > "' + flagFile.fsName + '"');
  batchFile.close();

  runnerFile.execute();

  function checkFlag() {
    return flagFile.exists;
  }

  while (!checkFlag()) {
    $.sleep(100);
  }

  flagFile.open("r");
  var returnCode = flagFile.readln();
  returnCode = parseInt(returnCode, 10);
  flagFile.close();

  return returnCode;
}

function removeSubstDriveLetters() {
  var driveLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var cmd = "@echo off";

  for (var i = 0; i < driveLetters.length; i++) {
    cmd = cmd + " & subst " + driveLetters[i] + ": /D >nul 2>nul";
  }

  app.system(cmd);
}

function mapNextAvailableDriveLetter(path) {
  var driveLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (var i = 0; i < driveLetters.length; i++) {
    var result = app.system("subst " + driveLetters[i] + ': "' + path + '"');
    if (result === 0) {
      return driveLetters[i];
    }
  }

  alert("Unable to map a drive letter to " + path);
  exit();
}

init();
main();
