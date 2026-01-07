import { shellCommandTool } from "./execute/shell-command";
import { globTool } from "./explore/glob";
import { grepTool } from "./explore/grep";
import { readFileTool } from "./explore/read-file";
import { deleteFileTool } from "./modify/delete-file";
import { editFileTool } from "./modify/edit-file";
import { writeFileTool } from "./modify/write-file";

export const tools = {
  shell_command: shellCommandTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  read_file: readFileTool,
  delete_file: deleteFileTool,
  glob: globTool,
  grep: grepTool,
} as const;
