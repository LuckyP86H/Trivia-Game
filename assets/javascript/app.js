$(document).ready(function () {
	var options = [
		{
			question: "A chi-square test involves a set of counts called 'expected counts'. What are the expected counts?",
			choice: ["Hypothetical counts that would occur of the alternative hypothesis were true.",
				"Hypothetical counts that would occur if the null hypothesis were true.",
				"The actual counts that did occur in the observed data.",
				"The long-run counts that would be expected if the observed counts are representative."],
			answer: 1
		},
		{
			question: "Pick the choice that best completes the following sentence. If a relationship between two variables is called statistically significant, it means the investigators think the variables are ______.",
			choice: ["related in the population represented by the sample",
				"not related in the population represented by the sample",
				"related in the sample due to chance alone",
				"very important"],
			answer: 0
		},
		{
			question: "Which of the following model include a backwards elimination feature selection routine?",
			choice: ["Infrential", "Exploratory", "Predictive", "Ordinary"],
			answer: 2

		},
		{
			question: "Which of the following is a categorical outcome?",
			choice: ["Infrential", "Exploratory", "Casual", "Mechanistic"],
			answer: 2,
		},
		{
			question: "Which of the following can be used to impuse data sets based ONLY on information in the training set",
			choice: ["infrential", "exploratory", "casual","mechanistic"],
			answer: 3
		},
		{
			question: "Which of the following statement is correct:",
			choice: ["If data is a list, if index is passed the values in data corresponding to the labels in the index will be pulled out.",
				"NaN is the standard missing data marker used in pandas.",
				"Series acts very similarly to a array.",
				"None of the above."],
			answer: 1
		},
		{
			question: "Which of the following clustering requires merging approach?",
			choice: ["Partitional", "Hierarchical", "Naive Bayes", "None of the above"],
			answer: 1
		},
		{
			question: " Which of the following function is used for k-means clustering?",
			choice: ["k-means", "kNN", "heatmap", "lambda"],
			answer: 0
		}];

	var correctCount = 0;
	var wrongCount = 0;
	var unanswerCount = 0;
	var timer = 20;
	var intervalId;
	var userGuess = "";
	var running = false;
	var qCount = options.length;
	var pick;
	var index;
	var newArray = [];
	var holder = [];



	$("#reset").hide();
	//click start button to start game
	$("#start").on("click", function () {
		$("#start").hide();
		displayQuestion();
		runTimer();
		for (var i = 0; i < options.length; i++) {
			holder.push(options[i]);
		}
	})
	//timer start
	function runTimer() {
		if (!running) {
			intervalId = setInterval(decrement, 1000);
			running = true;
		}
	}
	//timer countdown
	function decrement() {
		$("#timeleft").html("<h3>Time remaining: " + timer + "</h3>");
		timer--;

		//stop timer if reach 0
		if (timer === 0) {
			unanswerCount++;
			stop();
			$("#answerblock").html("<p>Time is up! The correct answer is: " + pick.choice[pick.answer] + "</p>");
		}
	}

	//timer stop
	function stop() {
		running = false;
		clearInterval(intervalId);
	}
	//randomly pick question in array if not already shown
	//display question and loop though and display possible answers
	function displayQuestion() {
		//generate random index in array
		index = Math.floor(Math.random() * options.length);
		pick = options[index];

		$("#questionblock").html("<h2>" + pick.question + "</h2>");
		for (var i = 0; i < pick.choice.length; i++) {
			var userChoice = $("<div>");
			userChoice.addClass("answerchoice");
			userChoice.html(pick.choice[i]);
			userChoice.attr("data-guessvalue", i);
			$("#answerblock").append(userChoice);
		}



		//click the solution that user
		$(".answerchoice").on("click", function () {
			//grab array position from userGuess
			userGuess = parseInt($(this).attr("data-guessvalue"));

			//correct guess or wrong guess outcomes
			if (userGuess === pick.answer) {
				stop();
				correctCount++;
				userGuess = "";
				$("#answerblock").html("<p>Correct!</p>");
				hidepicture();

			} else {
				stop();
				wrongCount++;
				userGuess = "";
				$("#answerblock").html("<p>Wrong! The correct answer is: " + pick.choice[pick.answer] + "</p>");
				hidepicture();
			}
		})
    }
    
	function hidepicture() {
		$("#answerblock");
		newArray.push(pick);
		options.splice(index, 1);

		var hidpic = setTimeout(function () {
			$("#answerblock").empty();
			timer = 20;

			//total count (correct and incorrect respectively)
			if ((wrongCount + correctCount + unanswerCount) === qCount) {
				$("#questionblock").empty();
				$("#questionblock").html("<h3>Game Over!  Here's how you did: </h3>");
				$("#answerblock").append("<h4> Correct: " + correctCount + "</h4>");
				$("#answerblock").append("<h4> Incorrect: " + wrongCount + "</h4>");
				$("#answerblock").append("<h4> Unanswered: " + unanswerCount + "</h4>");
				$("#reset").show();
				correctCount = 0;
				wrongCount = 0;
				unanswerCount = 0;

			} else {
				runTimer();
				displayQuestion();

			}
		}, 3000);
    }

	$("#reset").on("click", function () {
		$("#reset").hide();
		$("#answerblock").empty();
		$("#questionblock").empty();
		for (var i = 0; i < holder.length; i++) {
			options.push(holder[i]);
		}
		runTimer();
		displayQuestion();

	})

})