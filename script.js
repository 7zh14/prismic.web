const urls = [
  "https://gist.githubusercontent.com/Mwr247/ef9a06ee1d3209a558b05561f7332d8e/raw/vrcavtrdb.txt",
  "https://gist.githubusercontent.com/Mwr247/ef9a06ee1d3209a558b05561f7332d8e/raw/vrcavtrdb_qst.txt",
  "https://gist.githubusercontent.com/Mwr247/ef9a06ee1d3209a558b05561f7332d8e/raw/vrcavtrdb_ios.txt"
];

// Unused
const backupUrls = [
  "https://prismic.net/vrc/vrcavtrdb.txt",
  "https://prismic.net/vrc/vrcavtrdb_qst.txt",
  "https://prismic.net/vrc/vrcavtrdb_ios.txt"
];

var db;
var searchData;
var aviTemplate;
var searchGrid;
var lastLoadingText = "Initializing website"
var ready = false;
var searchResults = [];
var lastSearch = "";
var visibleElements = 0;
var resultsPerPage = 50;

function makeAviElement(dict) {
  const clone = aviTemplate.content.cloneNode(true);

  clone.querySelector(".avi-name").innerText = dict.name;
  clone.querySelector(".avi-author").innerText = dict.author;
  clone.querySelector(".avi-description").innerText = dict.description;
  clone.querySelector("a").href = "https://vrchat.com/home/avatar/" + dict.avatrId;
  clone.querySelector("b").href = "vrcx://avatar/" + dict.avatrId;
  if(dict.quest) {
    var q = clone.querySelector(".quest")
    q.classList.remove("quest-inactive")
  }
  return clone;
}

function searchMatched(item) {
  if(resultsPerPage > visibleElements) {
    searchGrid.appendChild(makeAviElement(item));
    visibleElements++;
  }
  searchResults.push(item);
}

function updateSize() {
  var x = window.innerWidth;
  var y = window.innerHeight;
  var elementsX = Math.floor(x/256);
  var elementsY = Math.floor(y/192);
  var totalElements = elementsX*(elementsY+1);
  resultsPerPage = totalElements;
  updateScroll();
}

function updateScroll() {
  const scrollPosition = window.innerHeight + window.scrollY;
  const bottomPosition = document.documentElement.scrollHeight;

  if (scrollPosition >= bottomPosition - 100) { // Trigger load when close to bottom
    var newCount = Math.min(visibleElements+resultsPerPage, searchResults.length);
    for(var i = visibleElements; i < newCount; i++) {
      searchGrid.appendChild(makeAviElement(searchResults[i]));
      visibleElements++;
    }
  }
}

window.addEventListener("resize", e=>{
  updateSize();
});
window.addEventListener("scroll", e=>{
  updateScroll();
});

window.addEventListener("DOMContentLoaded", e=>{
  updateSize();
  aviTemplate = document.getElementById("avi");
  searchGrid = document.querySelector(".grid-container");

  var searchForm = document.getElementById("searchform");
  searchForm.addEventListener("submit", e=>{
    e.preventDefault();

    var formData = new FormData(searchform);
    var query = formData.get("vrc_avatar_search").trim().toLowerCase();
    var names = formData.get("search_name");
    var authors = formData.get("search_author");
    var descriptions = formData.get("search_description");
    if(query == lastSearch) return;
    
    searchResults = [];
    visibleElements = 0;
    searchGrid.replaceChildren();

    // because the guy adds avatars to the end, these are the newest avatars
    for(var i = searchData.entries.length - 1; i >= 0; i--) {
      const entry = searchData.entries[i];
      if(names && entry.name && entry.name.includes(query)) {
        searchMatched(entry);
        continue;
      }
      if(authors && entry.author && entry.author.includes(query)) {
        searchMatched(entry);
        continue;
      }
      if(descriptions && entry.description && entry.description.includes(query)) {
        searchMatched(entry);
        continue;
      }
    }
    document.getElementById("result-count").innerText = `Found ${searchResults.length} avatars.`;
  });

  ready = true;
  setLoadingText(lastLoadingText);
});

function setLoadingText(str) {
  console.log(str);
  if(ready) {
    document.getElementById("loading-text").innerText = str + "...";
  } else {
    lastLoadingText = str;
  }
}

function markAvatars(obj, other, property) {
  let nfa = []
  const map = obj.idMap.actualMap;
  for(item of other) {
    const lookup = map[item];
    if(!lookup) {
      nfa.push(item)
      continue;
    }
    obj.entries[lookup][property] = true;
  }
  console.log(`Marked ${other.length-nfa.length} ${property} avatars.`)
  if(nfa.length > 0) {
    // TODO: this happens for avatars are quest/ios only and NOT on pc
    // Since I don't really care about those right now, I am not gonna bother fixing it
    console.error(`Found ${nfa.length} missing from the main list:`)
    console.log(nfa)
  }
}

async function getAuxPrismicObj(url) {
  var response = await fetch(url);
  var content = await response.text()
  var lines = content.split("\n").map(x=>x.substring(0, x.indexOf("\t")).split("").reverse().join(""));
  lines.shift();

  return lines;
}

const cipher = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+=";

function decodeAvatarID(crypt) {
  var decrypt = new Array(33);
  var newFormat = (cipher.indexOf(crypt[21]) >> 2) & 2;
  for(var i = 0; i<11; i++) {
    let idx = i*3;
    var first = cipher.indexOf(crypt[i*2]);
    var third = cipher.indexOf(crypt[i*2+1]);
    decrypt[idx] = cipher[(first >> newFormat) & 15];
    var second = 0
    if(newFormat == 0) {
      second = (first >> 2) & 12
    }else{
      second = (first & 3) << 2
    }
    decrypt[idx+1] = cipher[second | ((third >> 4) & 3)];
    decrypt[idx+2] = cipher[third & 15];
  }
  decrypt.pop()
  decrypt.splice(8, 0, '-');
  decrypt.splice(13, 0, '-');
  decrypt.splice(18, 0, '-');
  decrypt.splice(23, 0, '-');
  return "avtr_" + decrypt.join("");
}

async function getPrismicObj(url) {
  setLoadingText("Downloading avatar database");
  var response = await fetch(url);
  var content = await response.text()

  setLoadingText("Parsing avatar database");
  var avatar_data = {};

  var lines = content.split("\n").map(x=>x.split("\t"));
  var first = lines.shift();
  lines = lines.map(line=>line.map(x=>x.split("").reverse().join("")));
  avatar_data.avatarCount = first[0];
  avatar_data.authorCount = first[1];
  avatar_data.lastUpdate = first[2];
  avatar_data.entries = [];
  avatar_data.idMap = {};
  // devtools crashes otherwise
  avatar_data.idMap.actualMap = {};


  for(line of lines) {
    var obj = {};
    
    obj.encodedId = line[0];
    obj.name = line[1];
    obj.author = line[2];
    obj.description = line[3];
    obj.quest = false; // avatar not quest comaptible by default
    avatar_data.idMap.actualMap[line[0]] = avatar_data.entries.length;
    avatar_data.entries.push(obj);
    obj.avatrId = decodeAvatarID(line[0]) 
  }

  return avatar_data;
}

async function fetchAvatarData() {
  var main;
  var quest;
  var ios;

  setLoadingText("Checking cache")

  var gistId = urls[0].match(/\/([^\/]+)\/raw/)[1];
  var commitsUrl = `https://api.github.com/gists/${gistId}/commits`;
  var entry = await getData("cached_data", gistId + "_commit");
  console.log("Loaded db entry");

  var gistVersion = null;
  var response = await fetch(commitsUrl);
  if(response.status == 200) {
    var commits = await response.json();
    gistVersion = commits[0].version
    console.log("gist version: " + gistVersion)
  }else{
    console.log("github hates u i guess")
  }

  if(entry != null && gistVersion == entry.tag) {
    searchData = (await getData("cached_data", gistId)).avatar_data;
  } else {
    var arr = await Promise.all([
      getPrismicObj(urls[0]),
      getAuxPrismicObj(urls[1]),
      getAuxPrismicObj(urls[2])
    ]);
    main = arr[0];
    quest = arr[1];
    ios = arr[2];
    
    setLoadingText("Aggregating avatar data");
    markAvatars(main, quest, "quest");
    markAvatars(main, ios, "ios");
    
    searchData = main;
    if(gistVersion != null) {
      db.transaction(["cached_data"], 'readwrite').objectStore("cached_data").put({id: gistId, avatar_data: searchData});
      db.transaction(["cached_data"], 'readwrite').objectStore("cached_data").put({id: gistId+"_commit", tag: gistVersion});
    }
  }

  document.getElementsByClassName("loader")[0].classList.add("disabled");
  document.getElementById("avi-count").innerText = searchData.avatarCount;
  document.getElementById("author-count").innerText = searchData.authorCount;
  document.getElementById("last-update").innerText = searchData.lastUpdate;
}

function getData(storeName, key) {
  if(db == null) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = db.transaction([storeName]).objectStore(storeName).get(key);

    request.onsuccess = function(event) {
      resolve(request.result);
    };

    request.onerror = function(event) {
      resolve(null);
    };
  });
}

const request = indexedDB.open('prismic_database', 2);

request.onupgradeneeded = function(event) {
  const db = event.target.result;
  let objectStoreNames = db.objectStoreNames;
  for (let i = 0; i < objectStoreNames.length; i++) {
    db.deleteObjectStore(objectStoreNames[i]);
  }
  const tagsStore = db.createObjectStore('cached_data', { keyPath: 'id' });
};
request.onsuccess = function(event) {
  db = event.target.result;
  console.log('Database opened successfully');
  fetchAvatarData();
};
request.onerror = function(event) {
  db = null;
  console.error('Database error:', event.target.errorCode);
  fetchAvatarData();
};

let SK = `░██████╗██╗░░██╗
██╔════╝██║░██╔╝
╚█████╗░█████═╝░
░╚═══██╗██╔═██╗░
██████╔╝██║░╚██╗
╚═════╝░╚═╝░░╚═╝
`;

console.log("%c" + SK, "color: #dd13ce");
