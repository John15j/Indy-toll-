const AndradeLabs = {

project:"My Project",

version:"v1.0.0",

build:"AL-001",

date:new Date().toLocaleDateString("en-US",{
year:"numeric",
month:"long",
day:"numeric"
}),

projects:"#"

};

document.getElementById("al-project").textContent=AndradeLabs.project;

document.getElementById("al-version").textContent=AndradeLabs.version;

document.getElementById("al-build").textContent=AndradeLabs.build;

document.getElementById("al-date").textContent=AndradeLabs.date;

document.getElementById("al-projects").href=AndradeLabs.projects;