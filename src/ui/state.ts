import { PackageSelectionState } from '../types'

export interface UIState {
  currentRow: number
  previousRow: number
  scrollOffset: number
  previousScrollOffset: number
  maxVisibleItems: number
  terminalHeight: number
  isInitialRender: boolean
  renderedLines: string[]
}

export class StateManager {
  private uiState: UIState
  private readonly headerLines = 4 // question + instructions + empty line + status line

  constructor(initialRow: number = 0, terminalHeight: number = 24) {
    this.uiState = {
      currentRow: initialRow,
      previousRow: -1,
      scrollOffset: 0,
      previousScrollOffset: 0,
      maxVisibleItems: Math.max(5, terminalHeight - this.headerLines - 2),
      terminalHeight,
      isInitialRender: true,
      renderedLines: [],
    }
  }

  getUIState(): UIState {
    return { ...this.uiState }
  }

  updateTerminalHeight(newHeight: number): boolean {
    const newMaxVisibleItems = Math.max(5, newHeight - this.headerLines - 2)

    if (
      newHeight !== this.uiState.terminalHeight ||
      newMaxVisibleItems !== this.uiState.maxVisibleItems
    ) {
      this.uiState.terminalHeight = newHeight
      this.uiState.maxVisibleItems = newMaxVisibleItems
      return true // Changed
    }
    return false // No change
  }

  navigateUp(totalItems: number): void {
    this.uiState.previousRow = this.uiState.currentRow
    this.uiState.currentRow = this.uiState.currentRow - 1
    if (this.uiState.currentRow < 0) {
      this.uiState.currentRow = totalItems - 1 // Wrap around to last item
    }
    this.ensureVisible(this.uiState.currentRow, totalItems)
  }

  navigateDown(totalItems: number): void {
    this.uiState.previousRow = this.uiState.currentRow
    this.uiState.currentRow = this.uiState.currentRow + 1
    if (this.uiState.currentRow >= totalItems) {
      this.uiState.currentRow = 0 // Wrap around to first item
    }
    this.ensureVisible(this.uiState.currentRow, totalItems)
  }

  private ensureVisible(rowIndex: number, totalItems: number): void {
    if (rowIndex < this.uiState.scrollOffset) {
      this.uiState.scrollOffset = rowIndex
    } else if (rowIndex >= this.uiState.scrollOffset + this.uiState.maxVisibleItems) {
      this.uiState.scrollOffset = rowIndex - this.uiState.maxVisibleItems + 1
    }
    // Ensure scrollOffset doesn't go negative or beyond bounds
    this.uiState.scrollOffset = Math.max(
      0,
      Math.min(this.uiState.scrollOffset, Math.max(0, totalItems - this.uiState.maxVisibleItems))
    )
  }

  updateSelection(states: PackageSelectionState[], direction: 'left' | 'right'): void {
    const currentState = states[this.uiState.currentRow]

    if (direction === 'left') {
      // Move selection left with wraparound: latest -> range -> none -> latest
      if (currentState.selectedOption === 'latest') {
        if (currentState.hasRangeUpdate) {
          currentState.selectedOption = 'range'
        } else {
          currentState.selectedOption = 'none'
        }
      } else if (currentState.selectedOption === 'range') {
        currentState.selectedOption = 'none'
      } else if (currentState.selectedOption === 'none') {
        // Wrap around to the last available option
        if (currentState.hasMajorUpdate) {
          currentState.selectedOption = 'latest'
        } else if (currentState.hasRangeUpdate) {
          currentState.selectedOption = 'range'
        }
      }
    } else {
      // Move selection right with wraparound: none -> range -> latest -> none
      if (currentState.selectedOption === 'none') {
        if (currentState.hasRangeUpdate) {
          currentState.selectedOption = 'range'
        } else if (currentState.hasMajorUpdate) {
          currentState.selectedOption = 'latest'
        }
      } else if (currentState.selectedOption === 'range') {
        if (currentState.hasMajorUpdate) {
          currentState.selectedOption = 'latest'
        } else {
          // Wrap around to none
          currentState.selectedOption = 'none'
        }
      } else if (currentState.selectedOption === 'latest') {
        // Wrap around to none
        currentState.selectedOption = 'none'
      }
    }
  }

  bulkSelectMinor(states: PackageSelectionState[]): void {
    states.forEach((state) => {
      if (state.hasRangeUpdate) {
        state.selectedOption = 'range'
      }
    })
  }

  bulkSelectLatest(states: PackageSelectionState[]): void {
    states.forEach((state) => {
      if (state.hasMajorUpdate) {
        state.selectedOption = 'latest'
      } else if (state.hasRangeUpdate) {
        state.selectedOption = 'range'
      }
    })
  }

  bulkUnselectAll(states: PackageSelectionState[]): void {
    states.forEach((state) => {
      state.selectedOption = 'none'
    })
  }

  markRendered(renderedLines: string[]): void {
    this.uiState.renderedLines = renderedLines
    this.uiState.previousRow = this.uiState.currentRow
    this.uiState.previousScrollOffset = this.uiState.scrollOffset
  }

  setInitialRender(isInitial: boolean): void {
    this.uiState.isInitialRender = isInitial
  }

  resetForResize(): void {
    this.ensureVisible(this.uiState.currentRow, this.uiState.maxVisibleItems)
    this.uiState.isInitialRender = true
  }
}
