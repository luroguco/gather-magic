#include <errno.h>
#include <libproc.h>
#include <mach/mach.h>
#include <mach/mach_error.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void print_json_string(const char *value) {
  putchar('"');
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor != '\0'; cursor++) {
    switch (*cursor) {
      case '\\':
        fputs("\\\\", stdout);
        break;
      case '"':
        fputs("\\\"", stdout);
        break;
      case '\n':
        fputs("\\n", stdout);
        break;
      case '\r':
        fputs("\\r", stdout);
        break;
      case '\t':
        fputs("\\t", stdout);
        break;
      default:
        if (*cursor < 0x20) {
          printf("\\u%04x", *cursor);
        } else {
          putchar(*cursor);
        }
        break;
    }
  }
  putchar('"');
}

static void print_json_field_prefix(const char *key, bool *needs_comma) {
  if (*needs_comma) {
    putchar(',');
  }
  putchar('\n');
  fputs("  ", stdout);
  print_json_string(key);
  fputs(": ", stdout);
  *needs_comma = true;
}

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <pid>\n", argv[0]);
    return 64;
  }

  char *endptr = NULL;
  const long parsed_pid = strtol(argv[1], &endptr, 10);
  if (endptr == argv[1] || *endptr != '\0' || parsed_pid <= 0 || parsed_pid > INT_MAX) {
    fprintf(stderr, "invalid pid: %s\n", argv[1]);
    return 64;
  }

  const pid_t pid = (pid_t)parsed_pid;
  char pid_path[PROC_PIDPATHINFO_MAXSIZE];
  memset(pid_path, 0, sizeof(pid_path));

  errno = 0;
  const int pid_path_length = proc_pidpath(pid, pid_path, sizeof(pid_path));
  const int pid_path_errno = errno;
  const bool pid_path_ok = pid_path_length > 0;

  mach_port_t task = MACH_PORT_NULL;
  const kern_return_t task_for_pid_result = task_for_pid(mach_task_self(), pid, &task);
  const bool task_for_pid_ok = task_for_pid_result == KERN_SUCCESS;
  mach_port_type_t task_port_type = 0;
  kern_return_t task_port_type_result = KERN_FAILURE;

  if (task_for_pid_ok) {
    task_port_type_result = mach_port_type(mach_task_self(), task, &task_port_type);
  }

  fputs("{", stdout);
  bool needs_comma = false;

  print_json_field_prefix("pid", &needs_comma);
  printf("%d", pid);

  print_json_field_prefix("uid", &needs_comma);
  printf("%d", getuid());

  print_json_field_prefix("euid", &needs_comma);
  printf("%d", geteuid());

  print_json_field_prefix("procPidPathOk", &needs_comma);
  fputs(pid_path_ok ? "true" : "false", stdout);

  print_json_field_prefix("procPidPathLength", &needs_comma);
  printf("%d", pid_path_length);

  print_json_field_prefix("procPidPath", &needs_comma);
  if (pid_path_ok) {
    print_json_string(pid_path);
  } else {
    fputs("null", stdout);
  }

  print_json_field_prefix("procPidPathErrno", &needs_comma);
  printf("%d", pid_path_errno);

  print_json_field_prefix("procPidPathErrnoMessage", &needs_comma);
  print_json_string(strerror(pid_path_errno));

  print_json_field_prefix("taskForPidOk", &needs_comma);
  fputs(task_for_pid_ok ? "true" : "false", stdout);

  print_json_field_prefix("taskForPidKernReturn", &needs_comma);
  printf("%d", task_for_pid_result);

  print_json_field_prefix("taskForPidMessage", &needs_comma);
  print_json_string(mach_error_string(task_for_pid_result));

  print_json_field_prefix("taskPort", &needs_comma);
  printf("%u", task);

  print_json_field_prefix("taskPortTypeChecked", &needs_comma);
  fputs(task_for_pid_ok ? "true" : "false", stdout);

  print_json_field_prefix("taskPortTypeKernReturn", &needs_comma);
  printf("%d", task_port_type_result);

  print_json_field_prefix("taskPortTypeMessage", &needs_comma);
  print_json_string(mach_error_string(task_port_type_result));

  print_json_field_prefix("taskPortType", &needs_comma);
  printf("%u", task_port_type);

  putchar('\n');
  fputs("}\n", stdout);

  if (task != MACH_PORT_NULL) {
    mach_port_deallocate(mach_task_self(), task);
  }

  return task_for_pid_ok ? 0 : 1;
}
