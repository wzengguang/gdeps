# gdeps
get deps for substrate core project from net 
get from "//redmond/exchange/Build/SUBSTRATE/LATEST/target/dev/" to "{your local}/src/target/dev/{project}"
# use
* Add GDeps.exe direcotry to envirenment variable.
* Open cmd, cd to your work project directory. The directory contains *.csproj file.
# command 
## gdeps  
default, not overrite and only target dll file.  
## gdeps -o   
get file overwrite your local file   
## gdeps -a   
get all file of target package.   
## gdeps -a -o
