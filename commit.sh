#!/bin/bash

# This script iterates through all changed files and commits them one by one with descriptive messages.

# ANSI colors for a premium CLI look
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Mapping function for descriptive commit messages
get_commit_message() {
    local file="$1"
    case "$file" in
        "commit.sh")
            echo "chore(git): update commit.sh to auto-generate descriptive and interactive commit messages"
            ;;
        ".gitignore")
            echo "chore(git): add commit.sh and docs/ to .gitignore"
            ;;
        "src/core/Engine.ts")
            echo "chore(engine): register updateDropshipSystem in the core engine game loop"
            ;;
        "src/ecs/World.ts")
            echo "feat(ecs): register dropships and player queries inside ECS World"
            ;;
        "src/ecs/components/index.ts")
            echo "feat(ecs): define isJetpacking flag and dropship state schemas"
            ;;
        "src/ecs/factories/BeaconFactory.ts")
            echo "feat(beacons): spawn beacons on planet surface and align upright along local normal vectors"
            ;;
        "src/ecs/factories/HazardFactory.ts")
            echo "feat(hazards): position hazards on spherical planet surface and align upright"
            ;;
        "src/ecs/factories/PlanetFactory.ts")
            echo "feat(planet): implement 3D simplex noise terrain height deformation and triplanar PBR material shading"
            ;;
        "src/ecs/systems/ParticleSystem.ts")
            echo "feat(particles): implement dual-thruster jetpack exhaust trails with custom color-shifting shaders"
            ;;
        "src/ecs/systems/PlayerControlSystem.ts")
            echo "feat(player): implement upright spherical movement, nested orbit camera, sonar scan pings, and jetpack flags"
            ;;
        "src/main.ts")
            echo "chore(main): align player and dropship landing zone spawn points next to each other at the North Pole"
            ;;
        "src/managers/InputManager.ts")
            echo "feat(input): map KeyF to active scanner action in InputManager"
            ;;
        "src/managers/PhysicsManager.ts")
            echo "fix(physics): disable global gravity vector to support manual spherical gravity calculations"
            ;;
        "src/ecs/factories/DropshipFactory.ts")
            echo "feat(dropship): construct procedural Landing Pad and Dropship models with physical colliders"
            ;;
        "src/ecs/systems/DropshipSystem.ts")
            echo "feat(dropship): implement dropship engine flame animations and player extraction system"
            ;;
        *)
            # Fallback dynamic messages based on action/path
            local action="$2"
            local base_name=$(basename "$file")
            echo "$action($base_name): update implementation and code structure"
            ;;
    esac
}

echo -e "${CYAN}=== Starting Interactive Individual Commits ===${NC}"

# Read files into arrays to avoid standard input collision with the interactive prompt
files=()
statuses=()

while IFS= read -r line; do
    if [ -n "$line" ]; then
        status_code="${line:0:2}"
        file_path="${line:3}"
        # Remove quotes around filename
        file_path=$(echo "$file_path" | sed -e 's/^"//' -e 's/"$//')
        files+=("$file_path")
        statuses+=("$status_code")
    fi
done < <(git status --porcelain=v1 -uall)

if [ ${#files[@]} -eq 0 ]; then
    echo -e "${GREEN}No changes to commit.${NC}"
    exit 0
fi

AUTO_COMMIT=false

for i in "${!files[@]}"; do
    file_path="${files[i]}"
    status_code="${statuses[i]}"

    if [ -z "$file_path" ]; then
        continue
    fi

    # Determine action for default message mapping
    case "$status_code" in
        " M" | "M ")
            action="update"
            ;;
        "??" | " A" | "A ")
            action="feat"
            ;;
        " D" | "D ")
            action="refactor"
            ;;
        "R ")
            action="refactor"
            ;;
        *)
            action="chore"
            ;;
    esac

    default_msg=$(get_commit_message "$file_path" "$action")

    echo -e "\n--------------------------------------------------"
    echo -e "${CYAN}File:${NC} $file_path [Status: $status_code]"
    echo -e "${CYAN}Proposed Message:${NC} ${GREEN}$default_msg${NC}"

    if [ "$AUTO_COMMIT" = "true" ]; then
        commit_msg="$default_msg"
        echo -e "${YELLOW}Auto-committing...${NC}"
    else
        echo -e -n "${YELLOW}Press [Enter] to accept, type a custom message, 's' to skip, or 'a' to auto-commit all: ${NC}"
        read -r user_input < /dev/tty

        if [ "$user_input" = "s" ] || [ "$user_input" = "S" ]; then
            echo -e "${RED}Skipped $file_path${NC}"
            continue
        elif [ "$user_input" = "a" ] || [ "$user_input" = "A" ]; then
            AUTO_COMMIT=true
            commit_msg="$default_msg"
            echo -e "${YELLOW}Auto-committing this and all remaining files...${NC}"
        elif [ -n "$user_input" ]; then
            commit_msg="$user_input"
        else
            commit_msg="$default_msg"
        fi
    fi

    # Stage the file
    case "$status_code" in
        " D" | "D ")
            git rm --cached "$file_path" > /dev/null 2>&1 || git rm "$file_path" > /dev/null 2>&1
            ;;
        *)
            git add "$file_path"
            ;;
    esac

    # Commit
    git commit -m "$commit_msg"
    echo -e "${GREEN}Committed successfully!${NC}"
done

echo -e "\n${CYAN}=== Done! All files processed individually. ===${NC}"
