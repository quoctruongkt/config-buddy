import { useEffect, useMemo, useState } from "react";
import "reactflow/dist/style.css";
import GraphCanvas from "./GraphCanvas";
import "./App.css";
import animationOptions from "./config/animation-options.json";
import JSZip from "jszip";

const initialData = {
  lessonId: "lesson_intro_001",
  uploadBasePath: "/uploads",
  uploadApiUrl: "https://media.monkeyuni.net/api/upload",
  uploadToken: "a813ec766197294184a938c331b08e7e",
  uploadFolderPath: "buddy-ai",
  uploadBucket: "monkeymedia2020",
  uploadDescription: "",
  uploadStatus: "",
  elevenApiKey:
    "0c08f6cf8f5f83b296b572828a8d2da9d792ab021e3722473b418a3e6f67ed3a",
  elevenVoiceId: "9faGPvNhEYnizK29r47M",
  elevenModelId: "eleven_multilingual_v2",
  elevenOutputFormat: "mp3_44100_128",
  background: "",
  backgroundMusicId: "",
  backgroundFileName: "",
  characters: ["blue", "pink"],
  dialogueNodes: [],
};

const movePositionOptions = [
  "out-left",
  "left",
  "out-right",
  "right",
  "center",
];

function createDialogueNode(index = 1) {
  return {
    id: `node_${String(index).padStart(3, "0")}`,
    speakerId: "",
    text: "",
    duration: 3000,
    audio: "",
    audioFileName: "",
    animations: [],
    moves: [],
    next: "",
  };
}

function createInteractionNode(index = 1) {
  return {
    id: `node_${String(index).padStart(3, "0")}`,
    speakerId: "user",
    interactionData: {
      mode: "speech_recognition",
      expectedKeywords: [],
      maxRetries: 2,
      timeout: 5,
    },
    responses: {
      onSuccess: "",
      onFail: "",
      onTimeout: "",
      onExhausted: "",
    },
    animations: [],
    moves: [],
  };
}

function isInteractionNode(node) {
  return !!node.interactionData;
}

function App() {
  const [lesson, setLesson] = useState(initialData);
  const [selectedNodeId, setSelectedNodeId] = useState(
    initialData.dialogueNodes[0]?.id || "",
  );
  const [pendingAudioByNode, setPendingAudioByNode] = useState({});
  const [ttsTextByNode, setTtsTextByNode] = useState({});
  const [characterPicker, setCharacterPicker] = useState(
    animationOptions.characterIds?.[0] || "",
  );
  const [loading, setLoading] = useState({
    backgroundUpload: false,
    ttsGenerate: false,
    audioUpload: false,
    submit: false,
  });
  const [submitResult, setSubmitResult] = useState("");
  const [subActionDurationError, setSubActionDurationError] = useState("");
  const [graphExpanded, setGraphExpanded] = useState(false);

  const selectedIndex = lesson.dialogueNodes.findIndex(
    (node) => node.id === selectedNodeId,
  );
  const selectedNode =
    selectedIndex >= 0 ? lesson.dialogueNodes[selectedIndex] : null;
  const nodeIdOptions = useMemo(
    () => lesson.dialogueNodes.map((node) => node.id).filter(Boolean),
    [lesson.dialogueNodes],
  );
  const targetNodeOptions = useMemo(
    () => nodeIdOptions.filter((nodeId) => nodeId !== selectedNodeId),
    [nodeIdOptions, selectedNodeId],
  );
  const characterIdOptions = useMemo(
    () => (lesson.characters || []).filter(Boolean),
    [lesson.characters],
  );
  const speakerOptions = useMemo(() => {
    if (!selectedNode) return characterIdOptions;
    return isInteractionNode(selectedNode)
      ? Array.from(new Set([...characterIdOptions, "user"]))
      : characterIdOptions;
  }, [selectedNode, characterIdOptions]);
  const backgroundMusicOptions = useMemo(
    () =>
      animationOptions.backgroundMusicId ||
      animationOptions.backgroundMusic ||
      [],
    [],
  );

  const outputJson = useMemo(() => {
    const normalizedNodes = lesson.dialogueNodes.map((node) => {
      const cleanedAnimations = (node.animations || []).map((animation) => ({
        characterId: animation.characterId,
        subActions: (animation.subActions || []).map((subAction) => ({
          startTime: Number(subAction.startTime) || 0,
          isLoop: !!subAction.isLoop,
          ...(subAction.duration !== "" && subAction.duration !== undefined
            ? { duration: Number(subAction.duration) || 0 }
            : {}),
          anim: subAction.anim || "",
          expression: subAction.expression || "",
          lookAt: subAction.lookAt || "",
          sfxId: subAction.sfxId || "",
          ...(subAction.textSegment
            ? { textSegment: subAction.textSegment }
            : {}),
        })),
      }));
      const cleanedMoves = (node.moves || []).map((move) => ({
        characterId: move.characterId || "",
        startTime: Number(move.startTime) || 0,
        duration: Number(move.duration) || 0,
        from: movePositionOptions.includes(move.from) ? move.from : "center",
        to: movePositionOptions.includes(move.to) ? move.to : "center",
        ...(move.rotateWithMovement !== undefined
          ? { rotateWithMovement: !!move.rotateWithMovement }
          : {}),
      }));

      if (isInteractionNode(node)) {
        return {
          id: node.id,
          speakerId: node.speakerId || "user",
          interactionData: {
            mode: node.interactionData?.mode || "speech_recognition",
            expectedKeywords: (
              node.interactionData?.expectedKeywords || []
            ).filter(Boolean),
            maxRetries: Number(node.interactionData?.maxRetries) || 0,
            timeout: Number(node.interactionData?.timeout) || 0,
          },
          responses: {
            onSuccess: node.responses?.onSuccess || "",
            onFail: node.responses?.onFail || "",
            onTimeout: node.responses?.onTimeout || "",
            onExhausted: node.responses?.onExhausted || "",
          },
          animations: cleanedAnimations,
          moves: cleanedMoves,
        };
      }

      return {
        id: node.id,
        speakerId: node.speakerId || "",
        text: node.text || "",
        duration: Number(node.duration) || 0,
        audio: node.audio || "",
        animations: cleanedAnimations,
        moves: cleanedMoves,
        ...(node.next ? { next: node.next } : {}),
      };
    });

    return JSON.stringify(
      {
        lessonId: lesson.lessonId,
        background: lesson.background,
        backgroundMusicId: lesson.backgroundMusicId || "",
        characters: lesson.characters.filter(Boolean),
        dialogueNodes: normalizedNodes,
      },
      null,
      2,
    );
  }, [lesson]);

  function updateLessonField(field, value) {
    setLesson((prev) => ({ ...prev, [field]: value }));
  }

  function buildServerPath(fileName) {
    const basePath = (lesson.uploadBasePath || "").trim();
    if (!basePath) return fileName;
    return `${basePath.replace(/\/+$/, "")}/${fileName}`;
  }

  function extractUploadedPath(responseData, fileName) {
    const pathCandidates = [
      responseData?.path,
      responseData?.url,
      responseData?.data?.path,
      responseData?.data?.url,
      responseData?.result?.path,
      responseData?.result?.url,
    ].filter(Boolean);
    if (pathCandidates.length > 0) return pathCandidates[0];
    return buildServerPath(fileName);
  }

  async function uploadFileToServer(file) {
    const apiUrl = (lesson.uploadApiUrl || "").trim();
    const token = (lesson.uploadToken || "").trim();

    if (!apiUrl) return { ok: false, message: "Missing upload API URL" };
    if (!token) return { ok: false, message: "Missing token header" };

    const form = new FormData();
    form.append("file", file);
    form.append("description", lesson.uploadDescription || "");
    form.append("folder_path", lesson.uploadFolderPath || "");
    form.append("bucket", lesson.uploadBucket || "");

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { token },
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          message: data?.message || `Upload failed: ${response.status}`,
        };
      }
      return { ok: true, path: extractUploadedPath(data, file.name) };
    } catch {
      return { ok: false, message: "Network/CORS error while uploading" };
    }
  }

  function readAudioDurationMs(fileOrBlob) {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      const objectUrl = URL.createObjectURL(fileOrBlob);
      audio.preload = "metadata";
      audio.src = objectUrl;
      audio.onloadedmetadata = () => {
        const durationMs = Number.isFinite(audio.duration)
          ? Math.round(audio.duration * 1000)
          : 0;
        URL.revokeObjectURL(objectUrl);
        resolve(durationMs);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(0);
      };
    });
  }

  async function handleBackgroundFilePick(file) {
    if (!file) return;
    setLoading((prev) => ({ ...prev, backgroundUpload: true }));
    updateLessonField("uploadStatus", `Uploading background: ${file.name}...`);
    const result = await uploadFileToServer(file);
    setLesson((prev) => ({
      ...prev,
      backgroundFileName: file.name,
      background: result.ok ? result.path : buildServerPath(file.name),
      uploadStatus: result.ok
        ? `Uploaded background: ${file.name}`
        : `Background upload failed (${result.message}). Fallback path was used.`,
    }));
    setLoading((prev) => ({ ...prev, backgroundUpload: false }));
  }

  function addCharacterFromPicker() {
    if (!characterPicker) return;
    setLesson((prev) => {
      if ((prev.characters || []).includes(characterPicker)) return prev;
      return {
        ...prev,
        characters: [...(prev.characters || []), characterPicker],
      };
    });
  }

  function removeCharacter(characterId) {
    setLesson((prev) => ({
      ...prev,
      characters: (prev.characters || []).filter((id) => id !== characterId),
    }));
  }

  function updateSelectedNodeField(field, value) {
    if (selectedIndex < 0) return;
    setLesson((prev) => {
      const nextNodes = [...prev.dialogueNodes];
      nextNodes[selectedIndex] = {
        ...nextNodes[selectedIndex],
        [field]: value,
      };
      return { ...prev, dialogueNodes: nextNodes };
    });
  }

  function updateNodeFieldById(nodeId, field, value) {
    setLesson((prev) => {
      const nextNodes = prev.dialogueNodes.map((node) =>
        node.id === nodeId ? { ...node, [field]: value } : node,
      );
      return { ...prev, dialogueNodes: nextNodes };
    });
  }

  async function generateTtsForSelectedNode() {
    if (!selectedNode || isInteractionNode(selectedNode)) return;

    const apiKey = (lesson.elevenApiKey || "").trim();
    const voiceId = (lesson.elevenVoiceId || "").trim();
    const modelId =
      (lesson.elevenModelId || "").trim() || "eleven_multilingual_v2";
    const outputFormat =
      (lesson.elevenOutputFormat || "").trim() || "mp3_44100_128";
    const textToSpeak = (
      ttsTextByNode[selectedNode.id] ||
      selectedNode.text ||
      ""
    ).trim();

    if (!apiKey) {
      updateLessonField("uploadStatus", "Missing ElevenLabs API key");
      return;
    }
    if (!voiceId) {
      updateLessonField("uploadStatus", "Missing ElevenLabs voice ID");
      return;
    }
    if (!textToSpeak) {
      updateLessonField("uploadStatus", "Missing text for TTS");
      return;
    }

    updateLessonField(
      "uploadStatus",
      `Generating TTS for ${selectedNode.id}...`,
    );
    setLoading((prev) => ({ ...prev, ttsGenerate: true }));

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: textToSpeak,
            model_id: modelId,
            output_format: outputFormat,
          }),
        },
      );

      if (!response.ok) {
        updateLessonField(
          "uploadStatus",
          `ElevenLabs error: ${response.status}`,
        );
        return;
      }

      const blob = await response.blob();
      const fileName = `${selectedNode.id}_${Date.now()}.mp3`;
      const file = new File([blob], fileName, { type: "audio/mpeg" });
      const durationMs = await readAudioDurationMs(file);
      const previewUrl = URL.createObjectURL(file);

      setPendingAudioByNode((prev) => ({
        ...prev,
        [selectedNode.id]: {
          file,
          previewUrl,
          fileName,
          source: "tts",
        },
      }));

      updateNodeFieldById(selectedNode.id, "audioFileName", fileName);
      if (durationMs > 0) {
        updateNodeFieldById(selectedNode.id, "duration", durationMs);
      }
      updateLessonField(
        "uploadStatus",
        `Generated TTS: ${fileName}. Click Upload Audio to send.`,
      );
    } catch {
      updateLessonField(
        "uploadStatus",
        "TTS request failed (network/CORS error)",
      );
    } finally {
      setLoading((prev) => ({ ...prev, ttsGenerate: false }));
    }
  }

  async function handleLocalAudioFilePick(file) {
    if (!file || !selectedNode || isInteractionNode(selectedNode)) return;
    const durationMs = await readAudioDurationMs(file);
    const previewUrl = URL.createObjectURL(file);
    setPendingAudioByNode((prev) => ({
      ...prev,
      [selectedNode.id]: {
        file,
        previewUrl,
        fileName: file.name,
        source: "local",
      },
    }));
    updateNodeFieldById(selectedNode.id, "audioFileName", file.name);
    if (durationMs > 0) {
      updateNodeFieldById(selectedNode.id, "duration", durationMs);
    }
    updateLessonField(
      "uploadStatus",
      `Picked audio: ${file.name}. Click Upload Audio to send.`,
    );
  }

  async function uploadPendingAudio() {
    if (!selectedNode || isInteractionNode(selectedNode)) return;

    const pending = pendingAudioByNode[selectedNode.id];
    if (!pending?.file) {
      updateLessonField(
        "uploadStatus",
        "No pending audio to upload. Pick or generate first.",
      );
      return;
    }

    updateLessonField(
      "uploadStatus",
      `Uploading audio: ${pending.file.name}...`,
    );
    setLoading((prev) => ({ ...prev, audioUpload: true }));
    try {
      const result = await uploadFileToServer(pending.file);

      if (result.ok) {
        updateNodeFieldById(selectedNode.id, "audio", result.path);
        updateLessonField(
          "uploadStatus",
          `Uploaded audio: ${pending.file.name}`,
        );
      } else {
        updateLessonField(
          "uploadStatus",
          `Audio upload failed: ${result.message}`,
        );
      }
    } finally {
      setLoading((prev) => ({ ...prev, audioUpload: false }));
    }
  }

  function updateSelectedNodeNested(path, value) {
    if (selectedIndex < 0) return;
    setLesson((prev) => {
      const nextNodes = [...prev.dialogueNodes];
      const current = { ...nextNodes[selectedIndex] };

      if (path[0] === "interactionData") {
        current.interactionData = {
          ...(current.interactionData || {}),
          [path[1]]: value,
        };
      }

      if (path[0] === "responses") {
        current.responses = {
          ...(current.responses || {}),
          [path[1]]: value,
        };
      }

      nextNodes[selectedIndex] = current;
      return { ...prev, dialogueNodes: nextNodes };
    });
  }

  function addNode(type) {
    setLesson((prev) => {
      const newIndex = prev.dialogueNodes.length + 1;
      const node =
        type === "interaction"
          ? createInteractionNode(newIndex)
          : createDialogueNode(newIndex);
      const nextNodes = [...prev.dialogueNodes, node];
      setSelectedNodeId(node.id);
      return { ...prev, dialogueNodes: nextNodes };
    });
  }

  function deleteSelectedNode() {
    if (selectedIndex < 0) return;
    setLesson((prev) => {
      const nextNodes = prev.dialogueNodes.filter(
        (_, index) => index !== selectedIndex,
      );
      const fallback = nextNodes[Math.max(0, selectedIndex - 1)];
      setSelectedNodeId(fallback?.id || "");
      return { ...prev, dialogueNodes: nextNodes };
    });
  }

  function setNodeType(type) {
    if (!selectedNode) return;

    if (type === "interaction" && !isInteractionNode(selectedNode)) {
      const converted = {
        id: selectedNode.id,
        speakerId: "user",
        interactionData: {
          mode: "speech_recognition",
          expectedKeywords: [],
          maxRetries: 2,
          timeout: 5,
        },
        responses: {
          onSuccess: "",
          onFail: "",
          onTimeout: "",
          onExhausted: "",
        },
        animations: selectedNode.animations || [],
        moves: selectedNode.moves || [],
      };
      replaceSelectedNode(converted);
    }

    if (type === "dialogue" && isInteractionNode(selectedNode)) {
      const converted = {
        id: selectedNode.id,
        speakerId: "",
        text: "",
        duration: 3000,
        audio: "",
        audioFileName: "",
        animations: selectedNode.animations || [],
        moves: selectedNode.moves || [],
        next: "",
      };
      replaceSelectedNode(converted);
    }
  }

  function replaceSelectedNode(node) {
    if (selectedIndex < 0) return;
    setLesson((prev) => {
      const nextNodes = [...prev.dialogueNodes];
      nextNodes[selectedIndex] = node;
      return { ...prev, dialogueNodes: nextNodes };
    });
  }

  function addAnimation() {
    if (!selectedNode) return;
    const next = [
      ...(selectedNode.animations || []),
      { characterId: "", subActions: [] },
    ];
    updateSelectedNodeField("animations", next);
  }

  function updateAnimation(animationIndex, field, value) {
    const next = [...(selectedNode.animations || [])];
    next[animationIndex] = { ...next[animationIndex], [field]: value };
    updateSelectedNodeField("animations", next);
  }

  function deleteAnimation(animationIndex) {
    const next = (selectedNode.animations || []).filter(
      (_, index) => index !== animationIndex,
    );
    updateSelectedNodeField("animations", next);
  }

  function addSubAction(animationIndex) {
    const next = [...(selectedNode.animations || [])];
    const target = next[animationIndex];
    const subActions = [
      ...(target.subActions || []),
      {
        startTime: 0,
        isLoop: false,
        duration: "",
        anim: "",
        expression: "",
        lookAt: "",
        sfxId: "",
        textSegment: "",
      },
    ];
    next[animationIndex] = { ...target, subActions };
    updateSelectedNodeField("animations", next);
    setSubActionDurationError("");
  }

  function updateSubAction(animationIndex, subActionIndex, field, value) {
    const next = [...(selectedNode.animations || [])];
    const animation = { ...next[animationIndex] };
    const subActions = [...(animation.subActions || [])];
    subActions[subActionIndex] = {
      ...subActions[subActionIndex],
      [field]: value,
    };
    animation.subActions = subActions;
    next[animationIndex] = animation;

    if (!isInteractionNode(selectedNode) && field === "duration") {
      const nodeDuration = Number(selectedNode.duration) || 0;
      const totalDuration = next.reduce((sum, anim) => {
        const subTotal = (anim.subActions || []).reduce(
          (subSum, subAction) => subSum + (Number(subAction.duration) || 0),
          0,
        );
        return sum + subTotal;
      }, 0);

      if (totalDuration > nodeDuration) {
        setSubActionDurationError(
          `Total subAction duration (${totalDuration}ms) cannot exceed node duration (${nodeDuration}ms).`,
        );
        return;
      }
    }

    setSubActionDurationError("");
    updateSelectedNodeField("animations", next);
  }

  function deleteSubAction(animationIndex, subActionIndex) {
    const next = [...(selectedNode.animations || [])];
    const animation = { ...next[animationIndex] };
    animation.subActions = (animation.subActions || []).filter(
      (_, index) => index !== subActionIndex,
    );
    next[animationIndex] = animation;
    updateSelectedNodeField("animations", next);
  }

  function addMove() {
    if (!selectedNode) return;
    const next = [
      ...(selectedNode.moves || []),
      {
        characterId: "",
        startTime: 0,
        duration: 0,
        from: "center",
        to: "center",
      },
    ];
    updateSelectedNodeField("moves", next);
  }

  function updateMove(moveIndex, field, value) {
    const next = [...(selectedNode.moves || [])];
    next[moveIndex] = { ...next[moveIndex], [field]: value };
    updateSelectedNodeField("moves", next);
  }

  function deleteMove(moveIndex) {
    const next = (selectedNode.moves || []).filter(
      (_, index) => index !== moveIndex,
    );
    updateSelectedNodeField("moves", next);
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(outputJson);
    } catch {
      // Ignore clipboard failure in unsupported environments.
    }
  }

  function downloadJson() {
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${lesson.lessonId || "lesson"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submitLesson() {
    const lessonId = (lesson.lessonId || "lesson").trim();
    const apiUrl = (lesson.uploadApiUrl || "").trim();
    const token = (lesson.uploadToken || "").trim();

    if (!apiUrl) {
      setSubmitResult("Missing upload API URL");
      return;
    }
    if (!token) {
      setSubmitResult("Missing token header");
      return;
    }

    setLoading((prev) => ({ ...prev, submit: true }));
    setSubmitResult("Đang nén và upload...");

    try {
      const zip = new JSZip();
      zip.file("data.json", outputJson);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const randomSuffix = Math.random().toString(36).slice(2, 6);
      const zipFile = new File([zipBlob], `${lessonId}_${randomSuffix}.zip`, {
        type: "application/zip",
      });

      const form = new FormData();
      form.append("file", zipFile);
      form.append("description", lesson.uploadDescription || "");
      form.append("folder_path", lesson.uploadFolderPath || "");
      form.append("bucket", lesson.uploadBucket || "");

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { token },
        body: form,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setSubmitResult(`Upload thất bại: ${data?.message || response.status}`);
        return;
      }

      const path = extractUploadedPath(data, zipFile.name);
      setSubmitResult(`Upload thành công! Path: ${path}`);
    } catch {
      setSubmitResult("Lỗi network/CORS khi upload");
    } finally {
      setLoading((prev) => ({ ...prev, submit: false }));
    }
  }

  async function importJsonConfig(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedNodes = Array.isArray(parsed?.dialogueNodes)
        ? parsed.dialogueNodes
        : [];

      const normalizedNodes = importedNodes.map((node, index) => {
        const baseNode = {
          id: node?.id || `node_${String(index + 1).padStart(3, "0")}`,
          speakerId: node?.speakerId || "",
          animations: Array.isArray(node?.animations)
            ? node.animations.map((animation) => ({
                characterId: animation?.characterId || "",
                subActions: Array.isArray(animation?.subActions)
                  ? animation.subActions.map((subAction) => ({
                      startTime: Number(subAction?.startTime) || 0,
                      isLoop: !!subAction?.isLoop,
                      duration:
                        subAction?.duration === "" ||
                        subAction?.duration === undefined
                          ? ""
                          : Number(subAction.duration) || 0,
                      anim: subAction?.anim || "",
                      expression: subAction?.expression || "",
                      lookAt: subAction?.lookAt || "",
                      sfxId: subAction?.sfxId || "",
                      textSegment: subAction?.textSegment || "",
                    }))
                  : [],
              }))
            : [],
          moves: Array.isArray(node?.moves)
            ? node.moves.map((move) => ({
                characterId: move?.characterId || "",
                startTime: Number(move?.startTime) || 0,
                duration: Number(move?.duration) || 0,
                from: movePositionOptions.includes(move?.from)
                  ? move.from
                  : "center",
                to: movePositionOptions.includes(move?.to) ? move.to : "center",
                ...(move?.rotateWithMovement !== undefined
                  ? { rotateWithMovement: !!move.rotateWithMovement }
                  : {}),
              }))
            : [],
        };

        if (node?.interactionData) {
          return {
            ...baseNode,
            interactionData: {
              mode: node.interactionData?.mode || "speech_recognition",
              expectedKeywords: Array.isArray(
                node.interactionData?.expectedKeywords,
              )
                ? node.interactionData.expectedKeywords
                : [],
              maxRetries: Number(node.interactionData?.maxRetries) || 0,
              timeout: Number(node.interactionData?.timeout) || 0,
            },
            responses: {
              onSuccess: node?.responses?.onSuccess || "",
              onFail: node?.responses?.onFail || "",
              onTimeout: node?.responses?.onTimeout || "",
              onExhausted: node?.responses?.onExhausted || "",
            },
          };
        }

        return {
          ...baseNode,
          text: node?.text || "",
          duration: Number(node?.duration) || 0,
          audio: node?.audio || "",
          audioFileName: node?.audioFileName || "",
          next: node?.next || "",
        };
      });

      setLesson((prev) => ({
        ...prev,
        lessonId: parsed?.lessonId || prev.lessonId,
        background: parsed?.background || "",
        backgroundMusicId: parsed?.backgroundMusicId || "",
        characters: Array.isArray(parsed?.characters) ? parsed.characters : [],
        dialogueNodes: normalizedNodes,
        uploadStatus: `Imported JSON: ${file.name}`,
      }));
      setSelectedNodeId(normalizedNodes[0]?.id || "");
      setPendingAudioByNode({});
      setSubActionDurationError("");
    } catch {
      updateLessonField("uploadStatus", `Import failed: ${file.name}`);
    }
  }

  const pendingAudio = selectedNode
    ? pendingAudioByNode[selectedNode.id]
    : null;
  const totalSubActionDuration = useMemo(() => {
    if (!selectedNode) return 0;
    return (selectedNode.animations || []).reduce((sum, animation) => {
      const subTotal = (animation.subActions || []).reduce(
        (subSum, subAction) => subSum + (Number(subAction.duration) || 0),
        0,
      );
      return sum + subTotal;
    }, 0);
  }, [selectedNode]);
  function handleGraphEdgeUpdate(sourceId, label, newTargetId) {
    setLesson((prev) => {
      const nodes = prev.dialogueNodes.map((node) => {
        if (node.id !== sourceId) return node;
        if (node.responses) {
          return {
            ...node,
            responses: { ...node.responses, [label]: newTargetId },
          };
        }
        return { ...node, next: newTargetId };
      });
      return { ...prev, dialogueNodes: nodes };
    });
  }

  useEffect(() => {
    setSubActionDurationError("");
  }, [selectedNodeId]);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Story Lesson Config Tool</h1>
          <p>
            Tao JSON lesson voi dialogue node, interaction node, animation va
            subAction.
          </p>
        </div>
        <div className="actions">
          <button type="button" onClick={copyJson}>
            Copy JSON
          </button>
          <button type="button" onClick={downloadJson}>
            Download JSON
          </button>
          <label>
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(event) => importJsonConfig(event.target.files?.[0])}
            />
            <span className="import-json-btn">Upload JSON</span>
          </label>
          <button
            type="button"
            onClick={submitLesson}
            disabled={loading.submit}
            style={{ background: loading.submit ? undefined : "#22c55e" }}
          >
            {loading.submit ? "Đang upload..." : "Submit"}
          </button>
          {submitResult && (
            <span
              style={{
                fontSize: "0.8rem",
                maxWidth: 300,
                wordBreak: "break-all",
              }}
            >
              {submitResult}
            </span>
          )}
        </div>
      </header>

      <section className="panel lesson-meta">
        <h2>Lesson Metadata</h2>
        <div className="grid two">
          <label>
            Lesson ID
            <input
              value={lesson.lessonId}
              onChange={(event) =>
                updateLessonField("lessonId", event.target.value)
              }
            />
          </label>
          <label>
            Background
            <input
              value={lesson.background}
              onChange={(event) =>
                updateLessonField("background", event.target.value)
              }
            />
          </label>
          <label>
            Background Music ID
            <select
              value={lesson.backgroundMusicId || ""}
              onChange={(event) =>
                updateLessonField("backgroundMusicId", event.target.value)
              }
            >
              <option value="">-- Select background music --</option>
              {backgroundMusicOptions.map((backgroundMusicId) => (
                <option key={backgroundMusicId} value={backgroundMusicId}>
                  {backgroundMusicId}
                </option>
              ))}
            </select>
          </label>
          <label>
            Upload Base Path
            <input
              value={lesson.uploadBasePath || ""}
              onChange={(event) =>
                updateLessonField("uploadBasePath", event.target.value)
              }
              placeholder="/uploads/lesson_intro_001"
            />
          </label>
          <label>
            Upload API URL
            <input
              value={lesson.uploadApiUrl || ""}
              onChange={(event) =>
                updateLessonField("uploadApiUrl", event.target.value)
              }
              placeholder="https://media.monkeyuni.net/api/upload"
            />
          </label>
          <label>
            Token Header
            <input
              type="password"
              value={lesson.uploadToken || ""}
              onChange={(event) =>
                updateLessonField("uploadToken", event.target.value)
              }
              placeholder="JWT token"
            />
          </label>
          <label>
            folder_path
            <input
              value={lesson.uploadFolderPath || ""}
              onChange={(event) =>
                updateLessonField("uploadFolderPath", event.target.value)
              }
              placeholder="App/uploads/game"
            />
          </label>
          <label>
            bucket
            <input
              value={lesson.uploadBucket || ""}
              onChange={(event) =>
                updateLessonField("uploadBucket", event.target.value)
              }
              placeholder="monkeymedia2020"
            />
          </label>
          <label>
            description
            <input
              value={lesson.uploadDescription || ""}
              onChange={(event) =>
                updateLessonField("uploadDescription", event.target.value)
              }
            />
          </label>
          <label>
            Pick Background File
            <input
              type="file"
              accept="image/*"
              disabled={loading.backgroundUpload}
              onChange={(event) =>
                handleBackgroundFilePick(event.target.files?.[0])
              }
            />
          </label>
        </div>

        <h3>ElevenLabs TTS</h3>
        <div className="grid two">
          <label>
            ElevenLabs API Key
            <input
              type="password"
              value={lesson.elevenApiKey || ""}
              onChange={(event) =>
                updateLessonField("elevenApiKey", event.target.value)
              }
            />
          </label>
          <label>
            Voice ID
            <input
              value={lesson.elevenVoiceId || ""}
              onChange={(event) =>
                updateLessonField("elevenVoiceId", event.target.value)
              }
            />
          </label>
          <label>
            Model ID
            <input
              value={lesson.elevenModelId || ""}
              onChange={(event) =>
                updateLessonField("elevenModelId", event.target.value)
              }
            />
          </label>
          <label>
            Output Format
            <input
              value={lesson.elevenOutputFormat || ""}
              onChange={(event) =>
                updateLessonField("elevenOutputFormat", event.target.value)
              }
            />
          </label>
        </div>

        {lesson.backgroundFileName ? (
          <p>Picked background: {lesson.backgroundFileName}</p>
        ) : null}
        {lesson.uploadStatus ? <p>{lesson.uploadStatus}</p> : null}
        <div>
          <label>
            Characters (from config json)
            <select
              value={characterPicker}
              onChange={(event) => setCharacterPicker(event.target.value)}
            >
              {(animationOptions.characterIds || []).map((characterId) => (
                <option key={characterId} value={characterId}>
                  {characterId}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button type="button" onClick={addCharacterFromPicker}>
              Add Character
            </button>
          </div>
          <div className="actions">
            {(lesson.characters || []).map((characterId) => (
              <button
                key={characterId}
                type="button"
                className="danger"
                onClick={() => removeCharacter(characterId)}
              >
                Remove {characterId}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="workspace">
        <aside className="panel node-list">
          <div className="section-head">
            <h2>Nodes</h2>
            <div className="actions compact">
              <button type="button" onClick={() => addNode("dialogue")}>
                + Dialogue
              </button>
              <button type="button" onClick={() => addNode("interaction")}>
                + Interaction
              </button>
            </div>
          </div>

          <div className="node-items">
            <small>Click node để edit</small>
          </div>

          <button
            type="button"
            className="graph-expand-btn"
            onClick={() => setGraphExpanded(true)}
          >
            Xem sơ đồ quan hệ
          </button>

          {graphExpanded && (
            <div
              className="graph-modal-overlay"
              onClick={() => setGraphExpanded(false)}
            >
              <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
                <div className="graph-modal-header">
                  <span>Sơ đồ quan hệ</span>
                  <button type="button" onClick={() => setGraphExpanded(false)}>
                    ✕ Đóng
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <GraphCanvas
                    dialogueNodes={lesson.dialogueNodes}
                    selectedNodeId={selectedNodeId}
                    onNodeClick={(id) => {
                      setSelectedNodeId(id);
                      setGraphExpanded(false);
                    }}
                    onEdgeUpdate={handleGraphEdgeUpdate}
                  />
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="panel editor">
          {selectedNode ? (
            <>
              <div className="section-head">
                <h2>Node Editor</h2>
                <button
                  type="button"
                  className="danger"
                  onClick={deleteSelectedNode}
                >
                  Delete Node
                </button>
              </div>

              <div className="grid two">
                <label>
                  Node ID
                  <input
                    value={selectedNode.id}
                    onChange={(event) => {
                      const newId = event.target.value;
                      updateSelectedNodeField("id", newId);
                      setSelectedNodeId(newId);
                    }}
                  />
                </label>
                <label>
                  Node Type
                  <select
                    value={
                      isInteractionNode(selectedNode)
                        ? "interaction"
                        : "dialogue"
                    }
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
                  <select
                    value={selectedNode.speakerId || ""}
                    onChange={(event) =>
                      updateSelectedNodeField("speakerId", event.target.value)
                    }
                  >
                    <option value="">-- Select speaker --</option>
                    {speakerOptions.map((speakerId) => (
                      <option key={speakerId} value={speakerId}>
                        {speakerId}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isInteractionNode(selectedNode) ? (
                <>
                  <h3>Interaction Data</h3>
                  <div className="grid two">
                    <label>
                      Mode
                      <input
                        value={selectedNode.interactionData?.mode || ""}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["interactionData", "mode"],
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      Expected Keywords (comma separated)
                      <input
                        value={(
                          selectedNode.interactionData?.expectedKeywords || []
                        ).join(", ")}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["interactionData", "expectedKeywords"],
                            event.target.value
                              .split(",")
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
                          updateSelectedNodeNested(
                            ["interactionData", "maxRetries"],
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      Timeout (seconds)
                      <input
                        type="number"
                        value={selectedNode.interactionData?.timeout ?? 0}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["interactionData", "timeout"],
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </div>

                  <h3>Responses</h3>
                  <div className="grid four">
                    <label>
                      onSuccess
                      <select
                        value={selectedNode.responses?.onSuccess || ""}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["responses", "onSuccess"],
                            event.target.value,
                          )
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`success-${nodeId}`} value={nodeId}>
                            {nodeId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      onFail
                      <select
                        value={selectedNode.responses?.onFail || ""}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["responses", "onFail"],
                            event.target.value,
                          )
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`fail-${nodeId}`} value={nodeId}>
                            {nodeId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      onTimeout
                      <select
                        value={selectedNode.responses?.onTimeout || ""}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["responses", "onTimeout"],
                            event.target.value,
                          )
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`timeout-${nodeId}`} value={nodeId}>
                            {nodeId}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      onExhausted
                      <select
                        value={selectedNode.responses?.onExhausted || ""}
                        onChange={(event) =>
                          updateSelectedNodeNested(
                            ["responses", "onExhausted"],
                            event.target.value,
                          )
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`exhausted-${nodeId}`} value={nodeId}>
                            {nodeId}
                          </option>
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
                        value={selectedNode.text || ""}
                        onChange={(event) =>
                          updateSelectedNodeField("text", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Duration (ms)
                      <input
                        type="number"
                        value={selectedNode.duration ?? 0}
                        onChange={(event) =>
                          updateSelectedNodeField(
                            "duration",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      Audio Path (server)
                      <input
                        value={selectedNode.audio || ""}
                        onChange={(event) =>
                          updateSelectedNodeField("audio", event.target.value)
                        }
                      />
                    </label>
                    <label className="full">
                      TTS Text (optional, default = Text ở trên)
                      <textarea
                        rows={2}
                        value={ttsTextByNode[selectedNode.id] || ""}
                        onChange={(event) =>
                          setTtsTextByNode((prev) => ({
                            ...prev,
                            [selectedNode.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Next Node ID
                      <select
                        value={selectedNode.next || ""}
                        onChange={(event) =>
                          updateSelectedNodeField("next", event.target.value)
                        }
                      >
                        <option value="">-- Select node --</option>
                        {targetNodeOptions.map((nodeId) => (
                          <option key={`next-${nodeId}`} value={nodeId}>
                            {nodeId}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="actions">
                    <button
                      type="button"
                      onClick={generateTtsForSelectedNode}
                      disabled={loading.ttsGenerate}
                    >
                      {loading.ttsGenerate ? "Generating..." : "Generate TTS"}
                    </button>
                    <label style={{ cursor: "pointer" }}>
                      <input
                        type="file"
                        accept="audio/*"
                        style={{ display: "none" }}
                        onChange={(event) =>
                          handleLocalAudioFilePick(event.target.files?.[0])
                        }
                      />
                      <span className="import-json-btn">Pick Audio File</span>
                    </label>
                    <button
                      type="button"
                      onClick={uploadPendingAudio}
                      disabled={loading.audioUpload}
                    >
                      {loading.audioUpload ? "Uploading..." : "Upload Audio"}
                    </button>
                  </div>

                  {pendingAudio ? (
                    <div>
                      <p>
                        Pending audio: {pendingAudio.fileName} (
                        {pendingAudio.source})
                      </p>
                      <audio controls src={pendingAudio.previewUrl} />
                    </div>
                  ) : null}

                  {selectedNode.audioFileName ? (
                    <p>Audio filename: {selectedNode.audioFileName}</p>
                  ) : null}
                </>
              )}

              <div className="section-head">
                <h3>Animations</h3>
                <button type="button" onClick={addAnimation}>
                  + Animation
                </button>
              </div>
              {!isInteractionNode(selectedNode) ? (
                <p>
                  Total subAction duration: {totalSubActionDuration}ms / Node
                  duration: {Number(selectedNode.duration) || 0}ms
                </p>
              ) : null}
              {subActionDurationError ? (
                <p className="danger">{subActionDurationError}</p>
              ) : null}

              {(selectedNode.animations || []).map(
                (animation, animationIndex) => (
                  <article
                    className="animation-card"
                    key={`${animation.characterId}-${animationIndex}`}
                  >
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
                      <select
                        value={animation.characterId || ""}
                        onChange={(event) =>
                          updateAnimation(
                            animationIndex,
                            "characterId",
                            event.target.value,
                          )
                        }
                      >
                        <option value="">-- Select character --</option>
                        {characterIdOptions.map((characterId) => (
                          <option key={characterId} value={characterId}>
                            {characterId}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="section-head">
                      <h4>Sub Actions</h4>
                      <button
                        type="button"
                        onClick={() => addSubAction(animationIndex)}
                      >
                        + SubAction
                      </button>
                    </div>

                    {(animation.subActions || []).map(
                      (subAction, subActionIndex) => (
                        <div
                          className="subaction-card"
                          key={`${subAction.anim}-${subActionIndex}`}
                        >
                          <div className="section-head">
                            <span>SubAction #{subActionIndex + 1}</span>
                            <button
                              type="button"
                              className="danger"
                              onClick={() =>
                                deleteSubAction(animationIndex, subActionIndex)
                              }
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
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "startTime",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Duration (optional)
                              <input
                                type="number"
                                value={subAction.duration ?? ""}
                                onChange={(event) =>
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "duration",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Is Loop
                              <select
                                value={subAction.isLoop ? "true" : "false"}
                                onChange={(event) =>
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "isLoop",
                                    event.target.value === "true",
                                  )
                                }
                              >
                                <option value="false">false</option>
                                <option value="true">true</option>
                              </select>
                            </label>
                            <label>
                              Anim
                              {(() => {
                                const selectedAnim = (
                                  animationOptions.animations || []
                                ).find((a) => a.id === subAction.anim);
                                return selectedAnim ? (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      fontSize: "0.8em",
                                      color: "#888",
                                    }}
                                  >
                                    ⏱{" "}
                                    {selectedAnim.duration > 0
                                      ? `${selectedAnim.duration}ms`
                                      : "loop"}
                                  </span>
                                ) : null;
                              })()}
                              <select
                                value={subAction.anim || ""}
                                onChange={(event) =>
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "anim",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">-- Select anim --</option>
                                {(animationOptions.animations || []).map(
                                  (anim) => (
                                    <option key={anim.id} value={anim.id}>
                                      {anim.id}
                                      {anim.duration > 0
                                        ? ` (${anim.duration}ms)`
                                        : " (loop)"}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              Expression
                              <select
                                value={subAction.expression || ""}
                                onChange={(event) =>
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "expression",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">
                                  -- Select expression --
                                </option>
                                {(animationOptions.expressions || []).map(
                                  (expression) => (
                                    <option key={expression} value={expression}>
                                      {expression}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              Look At
                              <select
                                value={subAction.lookAt || ""}
                                onChange={(event) =>
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "lookAt",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">-- None --</option>
                                {[
                                  ...characterIdOptions.filter(
                                    (id) => id !== animation.characterId,
                                  ),
                                  "user",
                                ].map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              SFX ID
                              <select
                                value={subAction.sfxId || ""}
                                onChange={(event) =>
                                  updateSubAction(
                                    animationIndex,
                                    subActionIndex,
                                    "sfxId",
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="">-- Select SFX --</option>
                                {(animationOptions.sfxId || []).map((sfxId) => (
                                  <option key={sfxId} value={sfxId}>
                                    {sfxId}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <label>
                            Text Segment (optional)
                            <input
                              value={subAction.textSegment || ""}
                              onChange={(event) =>
                                updateSubAction(
                                  animationIndex,
                                  subActionIndex,
                                  "textSegment",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                      ),
                    )}
                  </article>
                ),
              )}

              <div className="section-head">
                <h3>Moves</h3>
                <button type="button" onClick={addMove}>
                  + Move
                </button>
              </div>

              {(selectedNode.moves || []).map((move, moveIndex) => (
                <article
                  className="animation-card"
                  key={`${move.characterId}-${moveIndex}`}
                >
                  <div className="section-head">
                    <strong>Move #{moveIndex + 1}</strong>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteMove(moveIndex)}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="grid three">
                    <label>
                      Character ID
                      <select
                        value={move.characterId || ""}
                        onChange={(event) =>
                          updateMove(
                            moveIndex,
                            "characterId",
                            event.target.value,
                          )
                        }
                      >
                        <option value="">-- Select character --</option>
                        {characterIdOptions.map((characterId) => (
                          <option
                            key={`move-${characterId}`}
                            value={characterId}
                          >
                            {characterId}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Start Time
                      <input
                        type="number"
                        value={move.startTime ?? 0}
                        onChange={(event) =>
                          updateMove(moveIndex, "startTime", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Duration
                      <input
                        type="number"
                        value={move.duration ?? 0}
                        onChange={(event) =>
                          updateMove(moveIndex, "duration", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      From
                      <select
                        value={move.from || "center"}
                        onChange={(event) =>
                          updateMove(moveIndex, "from", event.target.value)
                        }
                      >
                        {movePositionOptions.map((position) => (
                          <option
                            key={`from-${moveIndex}-${position}`}
                            value={position}
                          >
                            {position}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      To
                      <select
                        value={move.to || "center"}
                        onChange={(event) =>
                          updateMove(moveIndex, "to", event.target.value)
                        }
                      >
                        {movePositionOptions.map((position) => (
                          <option
                            key={`to-${moveIndex}-${position}`}
                            value={position}
                          >
                            {position}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Rotate With Movement
                      <select
                        value={move.rotateWithMovement ? "true" : "false"}
                        onChange={(event) =>
                          updateMove(
                            moveIndex,
                            "rotateWithMovement",
                            event.target.value === "true",
                          )
                        }
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    </label>
                  </div>
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
  );
}

export default App;
