import { useMemo, useState } from 'react'
import './App.css'

const initialData = {
  lessonId: 'lesson_intro_001',
  uploadBasePath: '/uploads',
  background: 'intro_background.jpg',
  backgroundFileName: '',
  characters: ['billy', 'teddy'],
  dialogueNodes: [
    {
      id: 'node_001',
      speakerId: 'billy',
      text: 'Hello there! My name is Billy, and I am very happy to meet you today!',
      duration: 4500,
      audio: 'audio1.mp3',
      audioFileName: '',
      animations: [
        {
          characterId: 'billy',
          subActions: [
            {
              startTime: 0,
              isLoop: false,
              anim: 'Waving',
              expression: 'happy',
              lookAt: 'user',
            },
          ],
        },
      ],
      next: 'node_002',
    },
  ],
}

function createDialogueNode(index = 1) {
  return {
    id: `node_${String(index).padStart(3, '0')}`,
    speakerId: '',
    text: '',
    duration: 3000,
    audio: '',
    audioFileName: '',
    animations: [],
    next: '',
  }
}

function createInteractionNode(index = 1) {
  return {
    id: `node_${String(index).padStart(3, '0')}`,
    speakerId: 'user',
    interactionData: {
      mode: 'speech_recognition',
      expectedKeywords: [],
      maxRetries: 2,
      timeout: 5,
    },
    responses: {
      onSuccess: '',
      onFail: '',
      onTimeout: '',
    },
    animations: [],
  }
}

function isInteractionNode(node) {
  return !!node.interactionData
}

function App() {
  const [lesson, setLesson] = useState(initialData)
  const [selectedNodeId, setSelectedNodeId] = useState(initialData.dialogueNodes[0]?.id || '')

  const selectedIndex = lesson.dialogueNodes.findIndex((node) => node.id === selectedNodeId)
  const selectedNode = selectedIndex >= 0 ? lesson.dialogueNodes[selectedIndex] : null
  const nodeIdOptions = useMemo(
    () => lesson.dialogueNodes.map((node) => node.id).filter(Boolean),
    [lesson.dialogueNodes],
  )
  const targetNodeOptions = useMemo(
    () => nodeIdOptions.filter((nodeId) => nodeId !== selectedNodeId),
    [nodeIdOptions, selectedNodeId],
  )

  const outputJson = useMemo(() => {
    const normalizedNodes = lesson.dialogueNodes.map((node) => {
      const cleanedAnimations = (node.animations || []).map((animation) => ({
        characterId: animation.characterId,
        subActions: (animation.subActions || []).map((subAction) => ({
          startTime: Number(subAction.startTime) || 0,
          isLoop: !!subAction.isLoop,
          ...(subAction.duration !== '' && subAction.duration !== undefined
            ? { duration: Number(subAction.duration) || 0 }
            : {}),
          anim: subAction.anim || '',
          expression: subAction.expression || '',
          lookAt: subAction.lookAt || '',
          ...(subAction.textSegment ? { textSegment: subAction.textSegment } : {}),
        })),
      }))

      if (isInteractionNode(node)) {
        return {
          id: node.id,
          speakerId: node.speakerId || 'user',
          interactionData: {
            mode: node.interactionData?.mode || 'speech_recognition',
            expectedKeywords: (node.interactionData?.expectedKeywords || []).filter(Boolean),
            maxRetries: Number(node.interactionData?.maxRetries) || 0,
            timeout: Number(node.interactionData?.timeout) || 0,
          },
          responses: {
            onSuccess: node.responses?.onSuccess || '',
            onFail: node.responses?.onFail || '',
            onTimeout: node.responses?.onTimeout || '',
          },
          animations: cleanedAnimations,
        }
      }

      return {
        id: node.id,
        speakerId: node.speakerId || '',
        text: node.text || '',
        duration: Number(node.duration) || 0,
        audio: node.audio || '',
        animations: cleanedAnimations,
        ...(node.next ? { next: node.next } : {}),
      }
    })

    return JSON.stringify(
      {
        lessonId: lesson.lessonId,
        background: lesson.background,
        characters: lesson.characters.filter(Boolean),
        dialogueNodes: normalizedNodes,
      },
      null,
      2,
    )
  }, [lesson])

  function updateLessonField(field, value) {
    setLesson((prev) => ({ ...prev, [field]: value }))
  }

  function buildServerPath(fileName) {
    const basePath = (lesson.uploadBasePath || '').trim()
    if (!basePath) return fileName
    return `${basePath.replace(/\/+$/, '')}/${fileName}`
  }

  function readAudioDurationMs(file) {
    return new Promise((resolve) => {
      const audio = document.createElement('audio')
      const objectUrl = URL.createObjectURL(file)
      audio.preload = 'metadata'
      audio.src = objectUrl
      audio.onloadedmetadata = () => {
        const durationMs = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0
        URL.revokeObjectURL(objectUrl)
        resolve(durationMs)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(0)
      }
    })
  }

  function handleBackgroundFilePick(file) {
    if (!file) return
    setLesson((prev) => ({
      ...prev,
      backgroundFileName: file.name,
      background: buildServerPath(file.name),
    }))
  }

  function updateCharacters(textValue) {
    const characters = textValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    setLesson((prev) => ({ ...prev, characters }))
  }

  function updateSelectedNodeField(field, value) {
    if (selectedIndex < 0) return
    setLesson((prev) => {
      const nextNodes = [...prev.dialogueNodes]
      nextNodes[selectedIndex] = { ...nextNodes[selectedIndex], [field]: value }
      return { ...prev, dialogueNodes: nextNodes }
    })
  }

  async function handleAudioFilePick(file) {
    if (!file || !selectedNode || isInteractionNode(selectedNode)) return
    const durationMs = await readAudioDurationMs(file)
    updateSelectedNodeField('audioFileName', file.name)
    updateSelectedNodeField('audio', buildServerPath(file.name))
    if (durationMs > 0) {
      updateSelectedNodeField('duration', durationMs)
    }
  }

  function updateSelectedNodeNested(path, value) {
    if (selectedIndex < 0) return
    setLesson((prev) => {
      const nextNodes = [...prev.dialogueNodes]
      const current = { ...nextNodes[selectedIndex] }

      if (path[0] === 'interactionData') {
        current.interactionData = {
          ...(current.interactionData || {}),
          [path[1]]: value,
        }
      }

      if (path[0] === 'responses') {
        current.responses = {
          ...(current.responses || {}),
          [path[1]]: value,
        }
      }

      nextNodes[selectedIndex] = current
      return { ...prev, dialogueNodes: nextNodes }
    })
  }

  function addNode(type) {
    setLesson((prev) => {
      const newIndex = prev.dialogueNodes.length + 1
      const node = type === 'interaction' ? createInteractionNode(newIndex) : createDialogueNode(newIndex)
      const nextNodes = [...prev.dialogueNodes, node]
      setSelectedNodeId(node.id)
      return { ...prev, dialogueNodes: nextNodes }
    })
  }

  function deleteSelectedNode() {
    if (selectedIndex < 0) return
    setLesson((prev) => {
      const nextNodes = prev.dialogueNodes.filter((_, index) => index !== selectedIndex)
      const fallback = nextNodes[Math.max(0, selectedIndex - 1)]
      setSelectedNodeId(fallback?.id || '')
      return { ...prev, dialogueNodes: nextNodes }
    })
  }

  function setNodeType(type) {
    if (!selectedNode) return

    if (type === 'interaction' && !isInteractionNode(selectedNode)) {
      const converted = {
        id: selectedNode.id,
        speakerId: 'user',
        interactionData: {
          mode: 'speech_recognition',
          expectedKeywords: [],
          maxRetries: 2,
          timeout: 5,
        },
        responses: {
          onSuccess: '',
          onFail: '',
          onTimeout: '',
        },
        animations: selectedNode.animations || [],
      }
      replaceSelectedNode(converted)
    }

    if (type === 'dialogue' && isInteractionNode(selectedNode)) {
      const converted = {
        id: selectedNode.id,
        speakerId: '',
        text: '',
        duration: 3000,
        audio: '',
        audioFileName: '',
        animations: selectedNode.animations || [],
        next: '',
      }
      replaceSelectedNode(converted)
    }
  }

  function replaceSelectedNode(node) {
    if (selectedIndex < 0) return
    setLesson((prev) => {
      const nextNodes = [...prev.dialogueNodes]
      nextNodes[selectedIndex] = node
      return { ...prev, dialogueNodes: nextNodes }
    })
  }

  function addAnimation() {
    if (!selectedNode) return
    const next = [...(selectedNode.animations || []), { characterId: '', subActions: [] }]
    updateSelectedNodeField('animations', next)
  }

  function updateAnimation(animationIndex, field, value) {
    const next = [...(selectedNode.animations || [])]
    next[animationIndex] = { ...next[animationIndex], [field]: value }
    updateSelectedNodeField('animations', next)
  }

  function deleteAnimation(animationIndex) {
    const next = (selectedNode.animations || []).filter((_, index) => index !== animationIndex)
    updateSelectedNodeField('animations', next)
  }

  function addSubAction(animationIndex) {
    const next = [...(selectedNode.animations || [])]
    const target = next[animationIndex]
    const subActions = [
      ...(target.subActions || []),
      {
        startTime: 0,
        isLoop: false,
        duration: '',
        anim: '',
        expression: '',
        lookAt: '',
        textSegment: '',
      },
    ]
    next[animationIndex] = { ...target, subActions }
    updateSelectedNodeField('animations', next)
  }

  function updateSubAction(animationIndex, subActionIndex, field, value) {
    const next = [...(selectedNode.animations || [])]
    const animation = { ...next[animationIndex] }
    const subActions = [...(animation.subActions || [])]
    subActions[subActionIndex] = { ...subActions[subActionIndex], [field]: value }
    animation.subActions = subActions
    next[animationIndex] = animation
    updateSelectedNodeField('animations', next)
  }

  function deleteSubAction(animationIndex, subActionIndex) {
    const next = [...(selectedNode.animations || [])]
    const animation = { ...next[animationIndex] }
    animation.subActions = (animation.subActions || []).filter((_, index) => index !== subActionIndex)
    next[animationIndex] = animation
    updateSelectedNodeField('animations', next)
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(outputJson)
    } catch {
      // Ignore clipboard failure in unsupported environments.
    }
  }

  function downloadJson() {
    const blob = new Blob([outputJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${lesson.lessonId || 'lesson'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Story Lesson Config Tool</h1>
          <p>Tao JSON lesson voi dialogue node, interaction node, animation va subAction.</p>
        </div>
        <div className="actions">
          <button type="button" onClick={copyJson}>Copy JSON</button>
          <button type="button" onClick={downloadJson}>Download JSON</button>
        </div>
      </header>

      <section className="panel lesson-meta">
        <h2>Lesson Metadata</h2>
        <div className="grid two">
          <label>
            Lesson ID
            <input
              value={lesson.lessonId}
              onChange={(event) => updateLessonField('lessonId', event.target.value)}
            />
          </label>
          <label>
            Background
            <input
              value={lesson.background}
              onChange={(event) => updateLessonField('background', event.target.value)}
            />
          </label>
          <label>
            Upload Base Path
            <input
              value={lesson.uploadBasePath || ''}
              onChange={(event) => updateLessonField('uploadBasePath', event.target.value)}
              placeholder="/uploads/lesson_intro_001"
            />
          </label>
          <label>
            Pick Background File
            <input
              type="file"
              accept="image/*"
              onChange={(event) => handleBackgroundFilePick(event.target.files?.[0])}
            />
          </label>
        </div>
        {lesson.backgroundFileName ? <p>Picked background: {lesson.backgroundFileName}</p> : null}
        <label>
          Characters (comma separated)
          <input
            value={lesson.characters.join(', ')}
            onChange={(event) => updateCharacters(event.target.value)}
          />
        </label>
      </section>

      <main className="workspace">
        <aside className="panel node-list">
          <div className="section-head">
            <h2>Nodes</h2>
            <div className="actions compact">
              <button type="button" onClick={() => addNode('dialogue')}>+ Dialogue</button>
              <button type="button" onClick={() => addNode('interaction')}>+ Interaction</button>
            </div>
          </div>

          <div className="node-items">
            {lesson.dialogueNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`node-item ${selectedNodeId === node.id ? 'active' : ''}`}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span>{node.id}</span>
                <small>{isInteractionNode(node) ? 'interaction' : 'dialogue'}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel editor">
          {selectedNode ? (
            <>
              <div className="section-head">
                <h2>Node Editor</h2>
                <button type="button" className="danger" onClick={deleteSelectedNode}>
                  Delete Node
                </button>
              </div>

              <div className="grid two">
                <label>
                  Node ID
                  <input
                    value={selectedNode.id}
                    onChange={(event) => updateSelectedNodeField('id', event.target.value)}
                  />
                </label>
                <label>
                  Node Type
                  <select
                    value={isInteractionNode(selectedNode) ? 'interaction' : 'dialogue'}
                    onChange={(event) => setNodeType(event.target.value)}
                  >
                    <option value="dialogue">dialogue</option>
                    <option value="interaction">interaction</option>
                  </select>
                </label>
              </div>

              <div className="grid two">
                <label>
                  Speaker ID
                  <input
                    value={selectedNode.speakerId || ''}
                    onChange={(event) => updateSelectedNodeField('speakerId', event.target.value)}
                  />
                </label>
              </div>

              {isInteractionNode(selectedNode) ? (
                <>
                  <h3>Interaction Data</h3>
                  <div className="grid two">
                    <label>
                      Mode
                      <input
                        value={selectedNode.interactionData?.mode || ''}
                        onChange={(event) =>
                          updateSelectedNodeNested(['interactionData', 'mode'], event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Expected Keywords (comma separated)
                      <input
                        value={(selectedNode.interactionData?.expectedKeywords || []).join(', ')}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ['interactionData', 'expectedKeywords'],
                            event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          )
                        }
                      />
                    </label>
                    <label>
                      Max Retries
                      <input
                        type="number"
                        value={selectedNode.interactionData?.maxRetries ?? 0}
                        onChange={(event) =>
                          updateSelectedNodeNested(['interactionData', 'maxRetries'], event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Timeout (seconds)
                      <input
                        type="number"
                        value={selectedNode.interactionData?.timeout ?? 0}
                        onChange={(event) =>
                          updateSelectedNodeNested(['interactionData', 'timeout'], event.target.value)
                        }
                      />
                    </label>
                  </div>

                  <h3>Responses</h3>
                  <div className="grid three">
                    <label>
                      onSuccess
                      <select
                        value={selectedNode.responses?.onSuccess || ''}
                        onChange={(event) =>
                          updateSelectedNodeNested(['responses', 'onSuccess'], event.target.value)
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`success-${nodeId}`} value={nodeId}>{nodeId}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      onFail
                      <select
                        value={selectedNode.responses?.onFail || ''}
                        onChange={(event) =>
                          updateSelectedNodeNested(['responses', 'onFail'], event.target.value)
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`fail-${nodeId}`} value={nodeId}>{nodeId}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      onTimeout
                      <select
                        value={selectedNode.responses?.onTimeout || ''}
                        onChange={(event) =>
                          updateSelectedNodeNested(['responses', 'onTimeout'], event.target.value)
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`timeout-${nodeId}`} value={nodeId}>{nodeId}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <h3>Dialogue Data</h3>
                  <div className="grid two">
                    <label className="full">
                      Text
                      <textarea
                        rows={3}
                        value={selectedNode.text || ''}
                        onChange={(event) => updateSelectedNodeField('text', event.target.value)}
                      />
                    </label>
                    <label>
                      Duration (ms)
                      <input
                        type="number"
                        value={selectedNode.duration ?? 0}
                        onChange={(event) => updateSelectedNodeField('duration', event.target.value)}
                      />
                    </label>
                    <label>
                      Audio Path (server)
                      <input
                        value={selectedNode.audio || ''}
                        onChange={(event) => updateSelectedNodeField('audio', event.target.value)}
                      />
                    </label>
                    <label>
                      Pick Audio File
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(event) => handleAudioFilePick(event.target.files?.[0])}
                      />
                    </label>
                    <label>
                      Next Node ID
                      <select
                        value={selectedNode.next || ''}
                        onChange={(event) => updateSelectedNodeField('next', event.target.value)}
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`next-${nodeId}`} value={nodeId}>{nodeId}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selectedNode.audioFileName ? <p>Picked audio: {selectedNode.audioFileName}</p> : null}
                </>
              )}

              <div className="section-head">
                <h3>Animations</h3>
                <button type="button" onClick={addAnimation}>+ Animation</button>
              </div>

              {(selectedNode.animations || []).map((animation, animationIndex) => (
                <article className="animation-card" key={`${animation.characterId}-${animationIndex}`}>
                  <div className="section-head">
                    <strong>Animation #{animationIndex + 1}</strong>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteAnimation(animationIndex)}
                    >
                      Delete
                    </button>
                  </div>

                  <label>
                    Character ID
                    <input
                      value={animation.characterId || ''}
                      onChange={(event) =>
                        updateAnimation(animationIndex, 'characterId', event.target.value)
                      }
                    />
                  </label>

                  <div className="section-head">
                    <h4>Sub Actions</h4>
                    <button type="button" onClick={() => addSubAction(animationIndex)}>
                      + SubAction
                    </button>
                  </div>

                  {(animation.subActions || []).map((subAction, subActionIndex) => (
                    <div className="subaction-card" key={`${subAction.anim}-${subActionIndex}`}>
                      <div className="section-head">
                        <span>SubAction #{subActionIndex + 1}</span>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => deleteSubAction(animationIndex, subActionIndex)}
                        >
                          Delete
                        </button>
                      </div>

                      <div className="grid three">
                        <label>
                          Start Time
                          <input
                            type="number"
                            value={subAction.startTime ?? 0}
                            onChange={(event) =>
                              updateSubAction(animationIndex, subActionIndex, 'startTime', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Duration (optional)
                          <input
                            type="number"
                            value={subAction.duration ?? ''}
                            onChange={(event) =>
                              updateSubAction(animationIndex, subActionIndex, 'duration', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Is Loop
                          <select
                            value={subAction.isLoop ? 'true' : 'false'}
                            onChange={(event) =>
                              updateSubAction(
                                animationIndex,
                                subActionIndex,
                                'isLoop',
                                event.target.value === 'true',
                              )
                            }
                          >
                            <option value="false">false</option>
                            <option value="true">true</option>
                          </select>
                        </label>
                        <label>
                          Anim
                          <input
                            value={subAction.anim || ''}
                            onChange={(event) =>
                              updateSubAction(animationIndex, subActionIndex, 'anim', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Expression
                          <input
                            value={subAction.expression || ''}
                            onChange={(event) =>
                              updateSubAction(animationIndex, subActionIndex, 'expression', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Look At
                          <input
                            value={subAction.lookAt || ''}
                            onChange={(event) =>
                              updateSubAction(animationIndex, subActionIndex, 'lookAt', event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Text Segment (optional)
                        <input
                          value={subAction.textSegment || ''}
                          onChange={(event) =>
                            updateSubAction(animationIndex, subActionIndex, 'textSegment', event.target.value)
                          }
                        />
                      </label>
                    </div>
                  ))}
                </article>
              ))}
            </>
          ) : (
            <p>No node selected. Add a dialogue or interaction node first.</p>
          )}
        </section>

        <aside className="panel output">
          <h2>Output JSON</h2>
          <pre>{outputJson}</pre>
        </aside>
      </main>
    </div>
  )
}

export default App
