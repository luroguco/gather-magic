import json
import os
import shlex
from typing import Dict, List, Optional

import lldb


DEFAULT_ASSEMBLIES = [
    "Assembly-CSharp.dll",
    "SharedClientCore.dll",
]

DEFAULT_PATTERNS = [
    "collection",
    "inventory",
    "deckbuilder",
    "pantry",
    "wrapper",
]

DEFAULT_EXACT_CLASSES: List[str] = []


def _error_text(sb_error: lldb.SBError) -> str:
    if sb_error is None:
        return "unknown error"
    message = sb_error.GetCString()
    return message if isinstance(message, str) and message else "unknown error"


def _expression_options() -> lldb.SBExpressionOptions:
    options = lldb.SBExpressionOptions()
    options.SetIgnoreBreakpoints(True)
    options.SetTryAllThreads(False)
    options.SetTimeoutInMicroSeconds(5_000_000)
    options.SetLanguage(lldb.eLanguageTypeC_plus_plus)
    return options


def _evaluate(frame: lldb.SBFrame, expression: str) -> lldb.SBValue:
    value = frame.EvaluateExpression(expression, _expression_options())
    error = value.GetError()
    if error is not None and error.Fail():
        raise RuntimeError(f"{expression}: {_error_text(error)}")
    return value


def _evaluate_unsigned(frame: lldb.SBFrame, expression: str) -> int:
    return int(_evaluate(frame, expression).GetValueAsUnsigned())


def _strip_summary(summary: Optional[str]) -> Optional[str]:
    if not summary:
        return None

    cleaned = summary.strip()
    if cleaned.startswith('"') and cleaned.endswith('"') and len(cleaned) >= 2:
        return cleaned[1:-1]

    if '"' in cleaned:
        first = cleaned.find('"')
        last = cleaned.rfind('"')
        if first != -1 and last > first:
            return cleaned[first + 1:last]

    return cleaned or None


def _evaluate_string(frame: lldb.SBFrame, expression: str) -> Optional[str]:
    value = _evaluate(frame, expression)
    summary = _strip_summary(value.GetSummary())
    if summary is not None:
        return summary

    object_description = _strip_summary(value.GetObjectDescription())
    if object_description is not None:
        return object_description

    raw = value.GetValue()
    if isinstance(raw, str) and raw not in {"0x0", "0"}:
        return raw

    return None


def _setup_assemblies(frame: lldb.SBFrame) -> int:
    return _evaluate_unsigned(
        frame,
        "(unsigned long)({ size_t mtga_count_local = 0; (void*)il2cpp_domain_get_assemblies((void*)il2cpp_domain_get(), &mtga_count_local); (unsigned long)mtga_count_local; })",
    )


def _assembly_image_expr(index: int) -> str:
    return (
        f"(void*)({{"
        f" size_t mtga_count_local = 0;"
        f" void** assemblies = (void**)il2cpp_domain_get_assemblies((void*)il2cpp_domain_get(), &mtga_count_local);"
        f" (void*)il2cpp_assembly_get_image((void*)assemblies[{index}]);"
        f" }})"
    )


def _assembly_name(frame: lldb.SBFrame, index: int) -> Optional[str]:
    return _evaluate_string(frame, f"(const char*)il2cpp_image_get_name({_assembly_image_expr(index)})")


def _assembly_class_count(frame: lldb.SBFrame, index: int) -> int:
    return _evaluate_unsigned(frame, f"(unsigned long)il2cpp_image_get_class_count({_assembly_image_expr(index)})")


def _class_ptr_expr(assembly_index: int, class_index: int) -> str:
    return f"(void*)il2cpp_image_get_class({_assembly_image_expr(assembly_index)}, {class_index})"


def _class_name(frame: lldb.SBFrame, class_ptr: int) -> Optional[str]:
    return _evaluate_string(frame, f"(const char*)il2cpp_class_get_name((void*)0x{class_ptr:x})")


def _class_namespace(frame: lldb.SBFrame, class_ptr: int) -> Optional[str]:
    return _evaluate_string(frame, f"(const char*)il2cpp_class_get_namespace((void*)0x{class_ptr:x})")


def _field_names(frame: lldb.SBFrame, class_ptr: int, max_fields: int = 128) -> List[str]:
    names: List[str] = []

    for field_index in range(max_fields):
        field_ptr = _evaluate_unsigned(
            frame,
            f"(void*)({{"
            f" void* iter = 0;"
            f" void* field = 0;"
            f" for (int i = 0; i <= {field_index}; ++i) {{"
            f"   field = (void*)il2cpp_class_get_fields((void*)0x{class_ptr:x}, &iter);"
            f"   if (!field) break;"
            f" }}"
            f" field;"
            f" }})",
        )
        if field_ptr == 0:
            break

        field_name = _evaluate_string(frame, f"(const char*)il2cpp_field_get_name((void*)0x{field_ptr:x})")
        if field_name:
            names.append(field_name)

    return names


def _enumerate_assemblies(frame: lldb.SBFrame) -> List[Dict]:
    assembly_count = _setup_assemblies(frame)
    assemblies: List[Dict] = []

    for index in range(assembly_count):
        name = _assembly_name(frame, index)
        if not name:
            continue

        assemblies.append(
            {
                "index": index,
                "name": name,
                "classCount": _assembly_class_count(frame, index),
            }
        )

    return assemblies


def _find_candidate_classes(
    frame: lldb.SBFrame,
    assemblies: List[Dict],
    assembly_names: List[str],
    patterns: List[str],
    include_fields: bool,
) -> List[Dict]:
    assembly_lookup = {entry["name"]: entry for entry in assemblies}
    lowered_patterns = [pattern.lower() for pattern in patterns]
    matches: List[Dict] = []

    for assembly_name in assembly_names:
        assembly = assembly_lookup.get(assembly_name)
        if not assembly:
            continue

        assembly_index = int(assembly["index"])
        class_count = int(assembly["classCount"])

        for class_index in range(class_count):
            try:
                class_ptr = _evaluate_unsigned(frame, _class_ptr_expr(assembly_index, class_index))
                if class_ptr == 0:
                    continue

                class_name = _class_name(frame, class_ptr) or ""
                namespace = _class_namespace(frame, class_ptr) or ""
                qualified_name = f"{namespace}.{class_name}" if namespace else class_name
                lowered_name = qualified_name.lower()

                if not any(pattern in lowered_name for pattern in lowered_patterns):
                    continue

                matches.append(
                    {
                        "assembly": assembly_name,
                        "classIndex": class_index,
                        "classPointer": f"0x{class_ptr:x}",
                        "namespace": namespace,
                        "name": class_name,
                        "qualifiedName": qualified_name,
                        "fieldNames": _field_names(frame, class_ptr) if include_fields else [],
                    }
                )
            except Exception:  # noqa: BLE001
                continue

    return matches


def _find_exact_classes(
    frame: lldb.SBFrame,
    assemblies: List[Dict],
    assembly_names: List[str],
    exact_classes: List[str],
    include_fields: bool,
) -> List[Dict]:
    if not exact_classes:
        return []

    assembly_lookup = {entry["name"]: entry for entry in assemblies}
    requested_lookup: Dict[str, str] = {entry.lower(): entry for entry in exact_classes}
    matches: List[Dict] = []
    seen_keys = set()

    for assembly_name in assembly_names:
        assembly = assembly_lookup.get(assembly_name)
        if not assembly:
            continue

        assembly_index = int(assembly["index"])
        class_count = int(assembly["classCount"])

        for class_index in range(class_count):
            try:
                class_ptr = _evaluate_unsigned(frame, _class_ptr_expr(assembly_index, class_index))
                if class_ptr == 0:
                    continue

                class_name = _class_name(frame, class_ptr) or ""
                namespace = _class_namespace(frame, class_ptr) or ""
                qualified_name = f"{namespace}.{class_name}" if namespace else class_name
                candidates = {class_name.lower(), qualified_name.lower()}
                requested = next((requested_lookup[value] for value in candidates if value in requested_lookup), None)
                if not requested:
                    continue

                match_key = (assembly_name, qualified_name)
                if match_key in seen_keys:
                    continue

                seen_keys.add(match_key)
                matches.append(
                    {
                        "assembly": assembly_name,
                        "classIndex": class_index,
                        "classPointer": f"0x{class_ptr:x}",
                        "namespace": namespace,
                        "name": class_name,
                        "qualifiedName": qualified_name,
                        "matchedExactClass": requested,
                        "fieldNames": _field_names(frame, class_ptr) if include_fields else [],
                    }
                )
            except Exception:  # noqa: BLE001
                continue

    return matches


def collect(
    debugger: lldb.SBDebugger,
    out_path: str,
    assemblies: List[str],
    patterns: List[str],
    exact_classes: List[str],
    include_fields: bool,
) -> Dict:
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    thread = process.GetSelectedThread()
    frame = thread.GetFrameAtIndex(0)

    report = {
        "generatedAt": None,
        "processId": process.GetProcessID(),
        "targetExecutable": target.GetExecutable().fullpath,
        "assembliesRequested": assemblies,
        "classPatterns": patterns,
        "exactClassesRequested": exact_classes,
        "unmatchedExactClasses": [],
        "includeFields": include_fields,
        "assemblies": [],
        "matches": [],
        "errors": [],
    }

    try:
        report["assemblies"] = _enumerate_assemblies(frame)
        if exact_classes:
            report["matches"].extend(
                _find_exact_classes(frame, report["assemblies"], assemblies, exact_classes, include_fields)
            )
            matched_exact = {entry.get("matchedExactClass", "").lower() for entry in report["matches"]}
            report["unmatchedExactClasses"] = [
                entry for entry in exact_classes if entry.lower() not in matched_exact
            ]

        if patterns:
            existing_keys = {
                (entry.get("assembly"), entry.get("qualifiedName"))
                for entry in report["matches"]
            }
            for entry in _find_candidate_classes(frame, report["assemblies"], assemblies, patterns, include_fields):
                match_key = (entry.get("assembly"), entry.get("qualifiedName"))
                if match_key in existing_keys:
                    continue

                report["matches"].append(entry)
                existing_keys.add(match_key)
    except Exception as error:  # noqa: BLE001
        report["errors"].append(str(error))

    report["generatedAt"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")

    return report


def collect_command(debugger, command, result, internal_dict):  # noqa: ANN001, ARG001
    parts = shlex.split(command)
    out_path = None
    assemblies = list(DEFAULT_ASSEMBLIES)
    patterns = list(DEFAULT_PATTERNS)
    exact_classes = list(DEFAULT_EXACT_CLASSES)
    include_fields = False

    index = 0
    while index < len(parts):
        part = parts[index]
        next_part = parts[index + 1] if index + 1 < len(parts) else None

        if part == "--out" and next_part:
            out_path = next_part
            index += 2
            continue

        if part == "--assemblies" and next_part:
            assemblies = [value.strip() for value in next_part.split(",") if value.strip()]
            index += 2
            continue

        if part == "--patterns" and next_part:
            patterns = [value.strip() for value in next_part.split(",") if value.strip()]
            index += 2
            continue

        if part == "--classes" and next_part:
            exact_classes = [value.strip() for value in next_part.split(",") if value.strip()]
            index += 2
            continue

        if part == "--include-fields":
            include_fields = True
            index += 1
            continue

        index += 1

    if not out_path:
        result.SetError("Pass --out <path>.")
        return

    report = collect(debugger, out_path, assemblies, patterns, exact_classes, include_fields)
    result.AppendMessage(f"wrote {out_path}")
    result.AppendMessage(f"assemblies scanned: {len(report['assemblies'])}")
    result.AppendMessage(f"matches found: {len(report['matches'])}")
    if report["exactClassesRequested"]:
        result.AppendMessage(f"exact classes requested: {', '.join(report['exactClassesRequested'])}")
    if report["unmatchedExactClasses"]:
        result.AppendMessage(f"unmatched exact classes: {', '.join(report['unmatchedExactClasses'])}")
    if report["errors"]:
        result.AppendMessage("errors:")
        for entry in report["errors"]:
            result.AppendMessage(f"  - {entry}")


def __lldb_init_module(debugger, internal_dict):  # noqa: ANN001, ARG001
    debugger.HandleCommand("command script add -f mtgaLldbCollector.collect_command mtga_collect_json")
