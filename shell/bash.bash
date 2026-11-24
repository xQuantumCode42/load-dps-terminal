# Loaded only by a managed interactive Bash. Do not modify the user's startup files.
if [[ -f "$HOME/.bashrc" ]]; then source "$HOME/.bashrc"; fi
if [[ -z "${VSCODE_SHELL_INTEGRATION:-}" && -f "${LD_VSCODE_INTEGRATION:-}" ]]; then
    # This is manual integration; .bashrc has already run above.
    unset VSCODE_INJECTION
    source "$LD_VSCODE_INTEGRATION"
fi

ld-refresh() {
    local dir
    # Standard CLI destinations only. Do not source installer-created arbitrary code.
    for dir in "$HOME/.local/bin" "$HOME/.cargo/bin"; do
        if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then PATH="$PATH:$dir"; fi
    done
    export PATH
    hash -r
    rm -f -- "$LD_SESSION/refresh.request"
    printf '{"result":"refreshed","time":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LD_SESSION/status.json"
}

__ld_prompt() {
    local previous_exit=$? line entry
    entry=$(HISTTIMEFORMAT= builtin history 1)
    line="${entry#*[0-9]  }"
    if [[ -f "$LD_SESSION/refresh.request" ]]; then
        ld-refresh
    elif [[ "$LD_ENABLED" == 1 && "$previous_exit" == 0 && "$entry" != "$__ld_last_entry" ]]; then
        if [[ "$line" != *[\;\&\|\<\>\`]* && "$line" != *'$('* ]] &&
           [[ "$line" =~ ^[[:space:]]*(sudo[[:space:]]+)?((apt|apt-get|npm|pnpm|yarn|pip3?|cargo|brew)[[:space:]]+(install|i|ci|add|upgrade|update)|uv[[:space:]]+(tool|pip)[[:space:]]+install|python[0-9.]*[[:space:]]+-m[[:space:]]+pip[[:space:]]+install)([[:space:]]|$) ]]; then
            ld-refresh
        fi
    fi
    __ld_last_entry="$entry"
    return "$previous_exit"
}

if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then
    PROMPT_COMMAND=(__ld_prompt "${PROMPT_COMMAND[@]}")
else
    PROMPT_COMMAND="__ld_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
fi
ld-refresh
printf '%s\n' '[Load Dependency] Bash PATH/cache refresh enabled. Manual refresh: ld-refresh'
