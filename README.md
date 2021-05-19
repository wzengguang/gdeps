# gdeps
Get deps for substrate core project from net.             
Get from "\\redmond\exchange\Build\SUBSTRATE\LATEST\target\dev\{project dir}" to "{your local dir}/src/target/dev/{project}".    
# Use
* Add GDeps.exe direcotry to envirenment variable.
* Open cmd, cd to your work project directory. The directory contains *.csproj file.
# Command 
## gdeps  
default, not overrite and only target dll file.  
## gdeps -o   
get file overwrite your local file   
## gdeps -a   
get all file of target package.   
## gdeps -a -o
