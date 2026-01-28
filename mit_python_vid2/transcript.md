\[ 0:00] The following content is provided under a Creative Commons license.



\[ 0:04] Your support will help MIT OpenCourseWare continue to offer high quality educational resources for free.



\[ 0:11] To make a donation or view additional materials



\[ 0:13] from hundreds of MIT courses, visit MIT OpenCourseWare at ocw.mit.edu.



\[ 0:31] PROFESSOR: All right.



\[ 0:33] Let's get started, everyone.



\[ 0:35] So, good afternoon.



\[ 0:37] Welcome to the second lecture of 60001 and also of 600.



\[ 0:42] So as always, if you'd like to follow along with the lectures, please go ahead and download the slides and the code that I'll provide at least an hour before class every day.



\[ 0:53] All right.



\[ 0:53] So a quick recap of what we did last time.



\[ 0:56] So last time, we talked a little bit about what a computer is.



\[ 1:00] And I think the main takeaway from the last lecture is really that a computer only does what it is told, right?



\[ 1:06] So it's not going to spontaneously make decisions on its own.



\[ 1:10] You, as the programmer, have to tell it what you want it to do by writing programs.



\[ 1:15] OK.



\[ 1:16] So we talked about simple objects.



\[ 1:18] And these objects were of different types.



\[ 1:22] So we saw integers, floats, and Booleans.



\[ 1:25] And then we did a couple of simple operations with them.



\[ 1:28] Today, we're going to look at a different--



\[ 1:30] a new type of object called a string.



\[ 1:33] And then we're going to introduce some more powerful things in our programming toolbox.



\[ 1:42] So we're going to look at how to branch within a program,



\[ 1:44] and how to make things-- how to make the computer repeat certain tasks within our program.



\[ 1:50] All right.



\[ 1:51] So let's begin by looking at strings.



\[ 1:53] So strings are a new object type.



\[ 1:56] We've seen so far integers, which were whole numbers, floats, which were decimal numbers, and we have seen Booleans, which were true and false.



\[ 2:05] So strings are going to be sequences of characters.



\[ 2:09] And these characters can be anything.



\[ 2:11] They can be letters, digits, special characters, and also spaces.



\[ 2:17] And you tell Python that you're talking about a string object by enclosing it in quotation marks.



\[ 2:23] So in this case, I'm creating an object whose value is h-e-l-l-o space t-h-e-r-e.



\[ 2:32] And Python knows it's a string object, because we're enclosing it in quotations.



\[ 2:36] They can be either double quotes or single quotes,



\[ 2:38] but as long as you're consistent, it doesn't matter.



\[ 2:41] And this object, we're binding it to this variable named hi.



\[ 2:46] And we're using that using the equals sign, which is the assignment operator.



\[ 2:51] So from now on, whenever we refer to this variable hi, Python is going to say, oh, I know what the value is, and it's that string of characters.



\[ 3:00] So we're going to learn about two things



\[ 3:02] that you can do on strings today, two operations.



\[ 3:05] One is to concatenate them.



\[ 3:07] And concatenation is really just a fancy word for using this plus operator, which means put the strings together.



\[ 3:14] So I have this original variable named hi, and I create a new variable called name.



\[ 3:20] And in it, I'm going to assign the string a-n-a to the variable name.



\[ 3:27] And when I use the plus operator in between hi and name,



\[ 3:31] those two variables, Python is going to look at the values of those two, and it's going to just put them together.



\[ 3:38] OK.



\[ 3:39] I'm going to switch to Spider.



\[ 3:43] And this is just that example from the slides.



\[ 3:49] So let's see what happens.



\[ 3:50] So I have the variable hi, the variable name, and I'm just concatenating those two together.



\[ 3:57] And then I'm going to print that out.



\[ 3:59] So if I run the code, notice it prints out "hello thereana."



\[ 4:05] There's no space.



\[ 4:06] And there's no space because the concatenation operator, the plus, doesn't add any spaces implicitly.



\[ 4:13] So again, another example of just computer just doing what it's told.



\[ 4:17] If we want to add a space, we'd have to actually insert the space manually.



\[ 4:22] So that's this line here, line 8.



\[ 4:25] And in this line, we're concatenating the value of the variable hi with a space.



\[ 4:31] Notice we're putting it in quotation marks.



\[ 4:33] Just a space.



\[ 4:34] And then with name.



\[ 4:37] So if we'll go ahead and print that value,



\[ 4:41] notice this was that garbage greeting there.



\[ 4:45] And now we have a proper greeting, right?



\[ 4:52] So that's the concatenation between strings.



\[ 4:56] And then the other thing we're going to look at related to strings is the star operator.



\[ 5:04] So that's this one here on line 10.



\[ 5:07] So Python allows you to use the star operator, which



\[ 5:09] stands for multiplication, between a string and a number.



\[ 5:15] And when you do that, Python interprets it as repeat that string that many number of times.



\[ 5:25] So in this case, I'm creating a silly greeting,



\[ 5:29] and I'm concatenating the value of hi, which is "hello there"



\[ 5:33] with the space plus the name.



\[ 5:37] So notice here, I'm using parentheses



\[ 5:38] to tell Python, do this operation first, and then



\[ 5:42] multiply whatever the result of this is by 3.



\[ 5:48] So if I print that out, it's going to multiply the space with my name three times, and it's going to concatenate that with "hello there."



\[ 5:58] So that's exactly what it printed out there.



\[ 6:02] Last lecture, we talked a little bit about print.



\[ 6:05] Today, I'm going to talk about some nuances related to print.



\[ 6:09] So you use print to interact with the user.



\[ 6:12] It's cool to write programs that print things out to the user.



\[ 6:15] So the key word here being print.



\[ 6:19] And then you put parentheses after print.



\[ 6:22] And in the parentheses, you put in whatever



\[ 6:25] you want to show the user.



\[ 6:27] So in this little program, I have--



\[ 6:30] I created a variable named x.



\[ 6:31] I assigned it the value 1, and then I print 1.



\[ 6:35] Here, I'm casting.



\[ 6:38] So I'm taking the number one, the integer 1,



\[ 6:40] and I'm casting it to a string.



\[ 6:43] And you'll see why in a moment.



\[ 6:46] So I want to bring to your attention a couple of things here.



\[ 6:48] So in the first print, I'm using commas everywhere here.



\[ 6:54] And in the second print, I'm using plus.



\[ 7:01] So by definition, if you-- you can use commas inside a print-- inside the parentheses of print.



\[ 7:08] And if you use a comma, Python is going to automatically



\[ 7:13] add a space in between the two things that the comma is in between, the values.



\[ 7:20] So "my fav num is" is the first thing.



\[ 7:23] And the second thing is whatever's after the comma.



\[ 7:27] Let's take x.



\[ 7:29] So if you use a comma, Python is going to automatically insert a space for you.



\[ 7:34] Sometimes, you might want that, sometimes you might not.



\[ 7:36] If you don't want that, you can use the concatenation



\[ 7:39] operation, the plus.



\[ 7:41] And you can add all of your little bits together to create one big string.



\[ 7:48] If you're using commas, the items, the objects in between the commas, do not all have to be strings.



\[ 7:54] That's the plus side of using commas.



\[ 7:56] But the downside is you get spaces everywhere.



\[ 8:00] If you use plus operator, the plus side is Python does exactly what you tell it to do, but everything has to be a string object.



\[ 8:09] So "my fav num is" is a string object.



\[ 8:12] You have to convert all of your numbers to string objects, and so on.



\[ 8:18] So if we look at Spider-- This is the same-- almost the same code.



\[ 8:30] So here, I don't have spaces anywhere.



\[ 8:34] So you can see that the first line here has commas everywhere.



\[ 8:39] So I'm going to have spaces in between every one of the things that I'm printing out.



\[ 8:47] This line here is sort of a combination between commas and concatenation.



\[ 8:54] So depending on where I used the comma, I'm going to have an extra space.



\[ 8:58] And this line here just has concatenation everywhere.



\[ 9:02] So if I run this, notice this very first line added spaces everywhere in between all my objects.



\[ 9:10] The second one added spaces somewhere.



\[ 9:11] And you can sort of trace through and see exactly where



\[ 9:14] the spaces were added.



\[ 9:16] And the last line here didn't add spaces anywhere.



\[ 9:33] So printing things out to the console is nice, but the second part of sort of writing an interactive program



\[ 9:40] is getting input from the user.



\[ 9:43] And that's the more interesting part.



\[ 9:45] So if you've done problem set 0, you might have sort of already tried to understand this on your own.



\[ 9:50] But here we are.



\[ 9:52] So the way you get input from the user is using this command function called input.



\[ 10:00] And inside the parentheses, you type in whatever you'd like to prompt the user with.



\[ 10:07] So in this case, in my example here, I have input,



\[ 10:11] and then here I said "type anything."



\[ 10:14] So the user is going to see this text here,



\[ 10:16] and then the program is just going to stop.



\[ 10:19] And it's going to wait for the user to type in something and hit Enter.



\[ 10:23] As soon as the user types in Enter, whatever the user types in becomes a string.



\[ 10:31] If a user types in a number, for example, that becomes the string of that number.



\[ 10:36] So everything the user types in is



\[ 10:38] going to be made as a string.



\[ 10:43] In this line right here, whatever these the user types in becomes a string.



\[ 10:47] And we're going to bind that string object to this variable named text.



\[ 10:54] So now, further in my program, I could do whatever I want with this variable text.



\[ 10:58] In this case, I'm going to print 5\*text.



\[ 11:02] OK.



\[ 11:03] So if the user, for example, gave me "ha,"



\[ 11:07] I'm going to print "ha" 5 times.



\[ 11:10] If the user gave me 5, what do you think the user is-- what do you think is going to be printed out?



\[ 11:18] 25 or 5 five times?



\[ 11:22] Great.



\[ 11:23] Yes.



\[ 11:23] Exactly.



\[ 11:23] 5 five times.



\[ 11:28] Oftentimes, you don't want to work with numbers as strings, right?



\[ 11:32] You want to work with numbers as numbers, right?



\[ 11:34] So you have to cast.



\[ 11:36] And we learned that last lecture.



\[ 11:38] You cast by just putting in this little bit



\[ 11:41] right in front of the input.



\[ 11:43] And you can cast it to whatever type you want.



\[ 11:45] Here I cast it to an int, but you can also cast to a float if you want to work with floats.



\[ 11:50] And that converts whatever the user typed in,



\[ 11:53] as long as it's some number that Python knows how to convert, into the number itself.



\[ 11:59] So in this case, if the user gives me 5,



\[ 12:01] I'm going to print out 5 times 5 instead of 5 five times.



\[ 12:07] So that's the code here.



\[ 12:14] So the first bit is I'm going to get the user to type in anything, and I'm going to put 555.



\[ 12:23] And then when I type in the number, since I'm casting it, I'm going to do operations with the number.



\[ 12:27] Yeah, question.



\[ 12:28] AUDIENCE: \[INAUDIBLE]



\[ 12:32] PROFESSOR: Why do you want to cast to-- oh.



\[ 12:37] The question is why do you want to cast to a string?



\[ 12:41] Why do you want to cast a string to a number?



\[ 12:42] AUDIENCE: \[INAUDIBLE]



\[ 12:46] PROFESSOR: Oh, so Python always-- whatever you type in, just by default, by definition of the input command, Python always makes it a string.



\[ 12:58] So if you want to work with numbers,



\[ 12:59] you have to explicitly tell it, I'm going to work with a number.



\[ 13:03] So even if you give it the number 5, it's going to think it's the string 5.



\[ 13:08] Yeah.



\[ 13:09] That's just how input works.



\[ 13:13] The next thing we're going to look at is ways that you can start adding tests in your code.



\[ 13:25] And before you can start adding tests in your code, you need to be able to do the actual tests.



\[ 13:32] So this is where comparison operators come in.



\[ 13:39] So here, let's assume that i and j are variables.



\[ 13:44] The following comparisons are going to give you a Boolean.



\[ 13:48] So it's either going to say, this is true or this is false.



\[ 13:51] So that's going to be your test.



\[ 13:54] So if i and j are variables, you're allowed to compare ints with ints, floats with floats, strings with strings.



\[ 14:01] And you're allowed to compare ints



\[ 14:03] and floats between themselves, but you're not allowed to compare a string with a number.



\[ 14:09] In fact, if you even try to do that in Python-- in Spider



\[ 14:13] here, if I try to say, is the letter a greater than 5?



\[ 14:18] I get some angry text right here.



\[ 14:22] And this just tells me Python doesn't understand the meaning of-- how do I compare a string with a number?



\[ 14:30] OK.



\[ 14:31] So just like in math, we can do these usual comparisons.



\[ 14:36] We can say if something is greater than something, greater or equal to, less than, less than or equal to.



\[ 14:41] I'd like to bring to your attention the equality.



\[ 14:44] So the single equals sign is an assignment.



\[ 14:46] So you're taking a value, and you're assigning it to a variable.



\[ 14:49] But when you're doing the double equals sign, this is the test for equality.



\[ 14:53] Is the value of variable i the same



\[ 14:55] as the value of the variable j?



\[ 14:58] And that's, again, also going to give you a Boolean either true or false.



\[ 15:02] And you can also test for inequality with the exclamation equal.



\[ 15:06] So that means, is the value of the variable i



\[ 15:09] not equal to the value of the variable j?



\[ 15:12] True if yes, false if no.



\[ 15:16] OK.



\[ 15:17] So those are comparison operators on integer, floats, and strings.



\[ 15:21] On Booleans, you can do some logic operators.



\[ 15:25] And the simplest is just inverting.



\[ 15:30] So if a is a variable that has a Boolean value,



\[ 15:35] not a is just going to invert it.



\[ 15:37] So if a is true, then not a is false, and vice versa.



\[ 15:42] This is a table that sort of represents what I've said here.



\[ 15:45] So you can do-- you can use and and or.



\[ 15:49] These are key words in Python.



\[ 15:52] You can use those two key words on variables, on Boolean variables.



\[ 15:57] And you get the result a and b is only true



\[ 16:01] if both a and b are true.



\[ 16:04] And a or b is only false if a and b are false.



\[ 16:11] And this is the complete table just in case you need to reference it.



\[ 16:17] All right.



\[ 16:17] So now that we have ways to do logical-- question right there.



\[ 16:21] AUDIENCE: \[INAUDIBLE]



\[ 16:26] PROFESSOR: Yeah, great question.



\[ 16:27] So what does it mean to compare a string with a string with the greater than?



\[ 16:30] So that's just going to compare them, lexicographically.



\[ 16:34] So does it come first in the alphabet?



\[ 16:37] So we can even test that out.



\[ 16:39] We can say, is a greater than b?



\[ 16:44] And it's false.



\[ 16:48] So b comes later in the alphabet than a.



\[ 16:53] OK.



\[ 16:54] So now we have ways to do the tests.



\[ 16:56] So we can add some branching to our programming toolbox now that we have ways to do tests.



\[ 17:05] This is a map of MIT.



\[ 17:06] I'm going to go through sort of a little example to motivate why we would want to do branching in our code.



\[ 17:15] And I think after this lecture, you'll be able to sort of code up this algorithm that I'm going to explain.



\[ 17:20] So most of us see MIT as a maze.



\[ 17:21] I first did when I came here.



\[ 17:26] When I first came here, obviously, I



\[ 17:28] signed up for the free food mailing list.



\[ 17:30] And MIT, being a maze, I had no idea where to go, what the shortest path was to free food.



\[ 17:37] So one way to think about it is all I wanted to do



\[ 17:40] was get to the free food.



\[ 17:44] A very simple algorithm to get there would be to say,



\[ 17:47] OK, I'm going take my right hand, and I'm going to make sure that my right hand is always on a wall.



\[ 17:53] And I'm going to go around campus with my right hand always being at a wall.



\[ 17:56] And eventually, I'll get to where the free food is.



\[ 17:59] There might not be any left, right?



\[ 18:00] But I'll be there.



\[ 18:03] So the algorithm is as follows.



\[ 18:05] If my right hand always has to be on a wall,



\[ 18:07] then I'm going to say, if there's no wall to my right side, then I'm going to go right until I get to a wall.



\[ 18:17] Then if there's a wall to my right, and I can go forward, I'm just going to keep going forward.



\[ 18:26] If I keep going forward, and there's a wall to my right and in front of me, I'm going to turn around and go left.



\[ 18:31] And then if there's a wall to my right, in front of me, and to the left, then I'm going to turn around and go back.



\[ 18:37] So with this fairly simple algorithm,



\[ 18:40] I just follow the path always keeping the wall to my right.



\[ 18:46] And eventually, I would end up where I need to be.



\[ 18:50] So notice, I used, just in plain English, a few key words.



\[ 18:54] If, otherwise, things like that.



\[ 18:57] So in programming, we have those same constructs.



\[ 19:01] And those same sort of intuitive words can be used to tell Python to do something or to do something else or to choose from a different set of possibilities.



\[ 19:14] And this way, we can get the computer



\[ 19:16] to make decisions for us.



\[ 19:18] And you might be thinking, well, you



\[ 19:20] said that computers can't make decisions on their own.



\[ 19:23] It's not.



\[ 19:24] You, as programmers, are going to build these decisions



\[ 19:26] into the program, and all the computer



\[ 19:28] is going to do is going to reach the decision point and say,



\[ 19:31] OK, this is a decision point, should I go left or should I go right?



\[ 19:35] Or which one do I pick?



\[ 19:36] And these sort of decisions are created by you as a programmer.



\[ 19:40] And the computer just has to make the decision and choose a path.



\[ 19:43] OK.



\[ 19:45] So in programming, there's three sort of simple ways



\[ 19:47] that you can add control flow to your programs.



\[ 19:50] And that's making one decision and choosing



\[ 19:53] whether to execute something or execute something else.



\[ 19:57] The first is a simple if.



\[ 20:01] And given a program that just linearly



\[ 20:04] has statements that get executed,



\[ 20:07] whenever I reach an if statement,



\[ 20:11] you're going to check the condition.



\[ 20:13] The condition is going to be something that's going to get evaluated to either true or false.



\[ 20:21] So I've reached the condition here.



\[ 20:25] And if the condition is true, then I'm



\[ 20:26] going to additionally execute this extra set of expressions.



\[ 20:31] But if the condition is false, then I'm



\[ 20:33] just going to keep going through the program



\[ 20:35] and not execute that extra set of instructions.



\[ 20:41] How does Python know which instructions to execute?



\[ 20:44] They're going to be inside this what we call code block.



\[ 20:48] And the code block is denoted by indentation.



\[ 20:51] So it's going to be everything that's



\[ 20:53] indented is part of that if code block.



\[ 20:58] Typically, four spaces is indentation.



\[ 21:01] OK.



\[ 21:02] So that's how you write code that



\[ 21:06] decides whether to execute this extra thing or not.



\[ 21:10] Now let's say I don't just want to execute an extra thing,



\[ 21:14] I want to reach a point where I say,



\[ 21:17] I'll either go down this path or I'll do something else.



\[ 21:22] That's this right here.



\[ 21:27] So this if else construct says this is my code,



\[ 21:34] I've reached my decision point here,



\[ 21:37] if the condition inside the if is true,



\[ 21:42] then I'm going to execute maybe this set of statements here.



\[ 21:48] But if the condition is not true,



\[ 21:50] then I'm not going to execute that set of statements,



\[ 21:53] and instead I'm going to execute under whatever else is.



\[ 22:00] So using this construct, I'm either



\[ 22:02] going to do one set of expressions or the other,



\[ 22:04] but never both.



\[ 22:06] And after I've executed one or the other,



\[ 22:08] I'm going to continue on with just the regular execution of the program.



\[ 22:20] OK.



\[ 22:20] So we're able to either choose one thing,



\[ 22:22] choose one thing or another, but what if we want



\[ 22:24] to have more than one choice?



\[ 22:27] So if some number is equal to zero, I want to do this.



\[ 22:31] If it's equal to 1, I want to do this.



\[ 22:33] If it's equal to 2, I want to do this, and so on.



\[ 22:36] That's where this last one comes in.



\[ 22:39] And we introduced this other key word here called elif.



\[ 22:45] So that stands for short form for else if.



\[ 22:49] So first we check if this condition is true.



\[ 22:53] So we're going through our program,



\[ 22:54] we've reached our decision point,



\[ 22:56] if the condition is true, we're going to execute maybe



\[ 22:59] this set of instructions.



\[ 23:04] If the condition is not true, maybe we'll



\[ 23:06] check-- if the condition is not true,



\[ 23:09] we will check this next condition.



\[ 23:11] That's part of the elif right here.



\[ 23:14] And if that one's true, we're going



\[ 23:16] to execute a different set of instructions.



\[ 23:18] You can have more than one elif.



\[ 23:21] And depending on which one's true,



\[ 23:22] you're going to execute a different set of instructions.



\[ 23:25] And then this last else is sort of a catch all



\[ 23:28] where if none of the previous conditions were true,



\[ 23:31] then just do this last set of expressions.



\[ 23:35] So in this case, you're going to choose between one



\[ 23:38] of these three-- one of these four roots,



\[ 23:40] or however many you have.



\[ 23:43] And then when you're done making your choice,



\[ 23:45] you're going to execute the remaining set of instructions.



\[ 23:51] So the way this works is if more than one condition is true,



\[ 23:54] you're actually just going to enter one of them.



\[ 23:57] And you're going to enter the very first one that's true.



\[ 24:01] So you're never going to enter more than one



\[ 24:02] of these code blocks.



\[ 24:05] You always enter one, and you enter the first one



\[ 24:08] that evaluates to true.



\[ 24:15] So notice that we denoted code blocks using indentation.



\[ 24:19] And that's actually one of the things



\[ 24:21] that I really like about Python.



\[ 24:22] It sort of forces you to write pretty code and nice



\[ 24:26] looking code and just code that's very readable.



\[ 24:31] And that forces you to indent everything that's a code block.



\[ 24:36] So you can easily see sort of where the flow of control is



\[ 24:39] and where decision making points are and things like that.



\[ 24:44] So in this particular example, we have one if statement here,



\[ 24:49] and it checks if two variables are equal.



\[ 24:55] And we have an if, elif, else.



\[ 24:58] And in this example, we're going to enter either this code



\[ 25:01] block or this one or this one, depending



\[ 25:04] on the variables of x and y.



\[ 25:06] And we're only going into one code block.



\[ 25:08] And we'll enter the first one that's true.



\[ 25:13] Notice you can have nested conditionals.



\[ 25:16] So inside this first if, we have another if here.



\[ 25:22] And this inner if is only going to be checked when we enter



\[ 25:28] the first-- this outter if.



\[ 25:36] I do want to make one point, though.



\[ 25:39] So sometimes, you might forget to do the double equals sign



\[ 25:41] when you are checking for equality, and that's OK.



\[ 25:46] If you just use one equals sign, Python's



\[ 25:48] going to give you an error.



\[ 25:50] And it's going to say syntax error,



\[ 25:53] and it's going to highlight this line.



\[ 25:55] And then you're going to know that there's a mistake there.



\[ 25:58] And you should be using equality,



\[ 26:00] because it doesn't make sense to be



\[ 26:01] using-- to assign-- to be making an assignment inside the if.



\[ 26:12] So we've learned about branching.



\[ 26:13] And we know about conditionals.



\[ 26:17] Let's try to apply this to a little game.



\[ 26:22] And spoiler, we won't be able to.



\[ 26:24] We'll have to learn about a new thing.



\[ 26:27] But back in the 1980s, there was the Legend



\[ 26:29] of Zelda-- cool graphics-- where there was



\[ 26:33] a scene with the lost woods.



\[ 26:36] Oversimplification if anyone's a Zelda die hard fan.



\[ 26:40] But the basic idea was if you entered the woods,



\[ 26:45] you entered from the left to the right.



\[ 26:47] And then as long as you kept going right,



\[ 26:49] it would show you the same screen over and over again.



\[ 26:53] And the trick was you just had to go backward,



\[ 26:56] and then you'd exit the woods.



\[ 26:58] So very simple.



\[ 27:00] Using what we know so far, we could sort of code this up.



\[ 27:04] And we'd say something like this.



\[ 27:06] If the user exits right, then set the background



\[ 27:08] to the woods background.



\[ 27:11] Otherwise, set the background to the exit background.



\[ 27:15] Now let's say the user-- and then in the else, we're done.



\[ 27:18] Let's say the user went right.



\[ 27:20] Well, you'd show them the woods background,



\[ 27:22] and now ask them again, where do they want to go?



\[ 27:25] If they exit right, set the background



\[ 27:26] to the woods background.



\[ 27:27] Otherwise, set the background to the exit background, and so on.



\[ 27:31] So you notice that there's sort of no end to this, right?



\[ 27:35] How many times-- do you know how many times the user



\[ 27:38] might keep going right?



\[ 27:39] They might be really persistent, right?



\[ 27:41] And they'll be like maybe if I go 1,000 times,



\[ 27:44] I'll get out of the woods.



\[ 27:45] Maybe 1,001?



\[ 27:47] Maybe.



\[ 27:48] So this would probably be-- who knows how deep?



\[ 27:56] These nested ifs.



\[ 27:57] So we don't know.



\[ 28:00] So with what we know so far, we can't really



\[ 28:02] code this cute little game.



\[ 28:04] But enter loops.



\[ 28:07] And specifically, a while loop.



\[ 28:11] So this code here that could be infinitely number of nested



\[ 28:16] if statements deep can be rewritten



\[ 28:18] using these three lines.



\[ 28:21] So we say while the user exits right,



\[ 28:24] set the background to the woods background.



\[ 28:26] And with a while loop, it's going



\[ 28:28] to do what we tell it to do inside the loop,



\[ 28:30] and then it's going to check the condition again,



\[ 28:32] and then it's going to do what we



\[ 28:34] say it should do inside the code block,



\[ 28:36] and it's going to check the condition again.



\[ 28:39] And then when the condition-- as long as a condition is true,



\[ 28:42] it's going to keep doing that little loop there.



\[ 28:45] And as soon as the condition becomes false,



\[ 28:47] it's going to stop doing the loop



\[ 28:48] and do whatever's right after the while.



\[ 28:52] OK.



\[ 28:53] So that's basically how a while loop works.



\[ 28:57] We have while.



\[ 28:58] That's the key word.



\[ 29:00] The condition is something that gets



\[ 29:01] evaluated to true or false.



\[ 29:03] And once again, we have a code block that's indented,



\[ 29:07] and it tells Python, these are the expressions



\[ 29:08] I want to do as long as the condition is true.



\[ 29:16] So the condition is true, you evaluate every expression



\[ 29:18] in the code block.



\[ 29:19] When you reach the end of the expression-- end of the code



\[ 29:22] block, you check the condition again.



\[ 29:24] If it's true still, you keep doing the expressions.



\[ 29:27] Check it again, and so on.



\[ 29:32] So here's a little game.



\[ 29:35] And with these lines of code, we were



\[ 29:38] able-- we can code up the lost woods of Zelda.



\[ 29:43] Even worse graphics, by the way than the original Zelda



\[ 29:46] is this one that I coded up here.



\[ 29:48] So I print out the following things.



\[ 29:50] "You're in the Lost Forest.



\[ 29:51] Go left or right."



\[ 29:54] And my program's going to say, "You're in the Lost Forest.



\[ 29:57] Go left or right."



\[ 29:58] It's going to get user input.



\[ 29:59] It's going to say while the user keeps typing in right,



\[ 30:03] show them this text, and ask them again.



\[ 30:07] So I'm asking them again by just saying input here again.



\[ 30:11] And that's it.



\[ 30:11] That's going to just keep getting input from the user.



\[ 30:15] And if the user doesn't type in right, and maybe types in left,



\[ 30:18] you're going to exit out of this loop, and print out,



\[ 30:21] "You've got out of the Lost Forest."



\[ 30:24] So I have to show you this, because I spent too much time



\[ 30:28] on it.



\[ 30:30] But I decided to improve on the code that's in the slides.



\[ 30:37] And I've written here ways that you guys can also improve it.



\[ 30:41] So if I run my code-- "You're in the Lost Forest.



\[ 30:45] Go left or right."



\[ 30:46] So if I say left, then yay, I got out of the Lost Forest.



\[ 30:51] But if I go right, then I'm stuck, right?



\[ 30:56] I took down some trees.



\[ 30:57] You can see there's no more trees here.



\[ 30:59] I made a table, and then I flipped it over.



\[ 31:04] So the expansion to this if you want to try it out--



\[ 31:07] I put this in the comments here-- is try to use a counter.



\[ 31:12] If the user types in right the first two times,



\[ 31:14] just make that a sad face.



\[ 31:17] But if the user types in more than two times,



\[ 31:19] make them cut down some trees and build a table and flip it.



\[ 31:24] That's a cute little expansion if you



\[ 31:25] want to test yourself to make sure you are getting loops.



\[ 31:29] OK.



\[ 31:30] So so far, we've used while loops to ask for user input.



\[ 31:34] And that's actually somewhere where it makes sense



\[ 31:37] to use while loops, because you don't actually



\[ 31:39] know how many times the user is going to type in something.



\[ 31:43] You can use while loops to keep sort of a counter



\[ 31:47] and to write code that counts something.



\[ 31:52] If you do that, though, there's two things



\[ 31:55] you need to take care of.



\[ 31:56] The first is the first line here,



\[ 32:00] which is sort of an initialization of this loop



\[ 32:03] counter.



\[ 32:06] And the second is this line here,



\[ 32:09] which is incrementing your loop counter.



\[ 32:15] The reason why the second one is important



\[ 32:17] is because-- let's look at our condition here.



\[ 32:20] So while n is less than five.



\[ 32:24] If you didn't have this line here,



\[ 32:26] you would never increment n.



\[ 32:29] So every time through the loop, you just keep printing zeros.



\[ 32:33] And you would have an infinite loop.



\[ 32:34] I do want to show, though, what--



\[ 32:37] if you do have an infinite loop, it's not the end of the world.



\[ 32:40] So I can say something like-- so while true, print zero.



\[ 32:53] So this is going to give me an infinite loop in my program.



\[ 32:57] And-- whoop.



\[ 33:06] OK.



\[ 33:08] So notice it's just printing the letter p over and over again.



\[ 33:12] And if I let it go any longer, it's



\[ 33:13] going to slow down the computer.



\[ 33:15] So I'm going to hit Control-C or Command-C maybe.



\[ 33:18] And it's going to stop the program from printing.



\[ 33:22] So just in case you ever enter infinite loops



\[ 33:24] in your programs, just go to the console and hit Control-C,



\[ 33:28] and that's going to stop it from sort



\[ 33:31] of slowing down the computer.



\[ 33:34] OK.



\[ 33:35] So going back to this example, I was



\[ 33:36] saying that if you're using counters-- variables in order



\[ 33:40] to sort of count up inside the while loop,



\[ 33:42] you have to take care to initialize



\[ 33:44] a counter variable first.



\[ 33:46] And then to increment it, otherwise you'll



\[ 33:49] enter an infinite loop.



\[ 33:51] That feels a little bit tedious.



\[ 33:53] And so there's a shortcut for doing that exact same thing.



\[ 33:57] So these four lines, you can rewrite those



\[ 34:00] into these two lines right here using this new type of loop



\[ 34:04] called a for loop.



\[ 34:07] So the for loop says, for some loop variable-- in this case,



\[ 34:10] I named it n.



\[ 34:11] You can name it whatever you want.



\[ 34:13] In range 5-- we're going to come back



\[ 34:15] to what range means in a little bit-- print n.



\[ 34:22] So every time through the loop, you're



\[ 34:23] going to print out what the value of n is.



\[ 34:26] Range 5 actually creates internally



\[ 34:31] a sequence of numbers starting from 0



\[ 34:33] and going to that number 5 minus 1.



\[ 34:36] So the sequence is going to be 0, 1, 2, 3, and 4.



\[ 34:41] The first time through the loop, you're going to say n



\[ 34:44] is equal to 0.



\[ 34:45] Or internally, this is what happens.



\[ 34:47] N gets the value of 0.



\[ 34:48] You're going to print n.



\[ 34:51] Then you're going to go back to the top.



\[ 34:53] N gets the value 1.



\[ 34:55] Then you're going to go execute whatever is inside.



\[ 34:58] So you're going to print 1.



\[ 35:00] Then you're going to increment that



\[ 35:01] to the next value in the sequence.



\[ 35:03] You're going to print out 2, and so on.



\[ 35:07] So this is the general look of a for loop.



\[ 35:12] So we have for some loop variable-- again,



\[ 35:16] can be named whatever you want-- in range some number.



\[ 35:21] Do a bunch of stuff.



\[ 35:23] And again, these are part of this for loop code block.



\[ 35:26] So you should indent them to tell Python



\[ 35:29] that these are the things that you should do.



\[ 35:32] So when you're using range some number,



\[ 35:34] you start out with variable getting the value 0.



\[ 35:41] With variable having value 0, you're



\[ 35:44] going to execute all of these expressions.



\[ 35:47] After all the expressions in the code block are done,



\[ 35:50] you're going to go on to the next value.



\[ 35:53] So 1.



\[ 35:55] You're going to execute all these expressions



\[ 35:57] with the variable being value 1, and then so on



\[ 36:01] and so on until you go to some num minus 1.



\[ 36:10] That-- so using range in that way



\[ 36:13] is a little bit constraining, because you're always



\[ 36:16] going to get values starting from 0



\[ 36:18] and ending at some num minus 1, whatever



\[ 36:21] is in the parentheses in range.



\[ 36:23] Sometimes you might want to write programs that



\[ 36:25] maybe start at a custom value.



\[ 36:27] Don't start at 0.



\[ 36:28] Maybe they start at 5.



\[ 36:29] Maybe they start at minus 10.



\[ 36:32] And sometimes you might want to write programs



\[ 36:34] that don't go with-- don't expect the numbers by 1,



\[ 36:37] but maybe skip every other number,



\[ 36:39] go every two numbers, or every three numbers, and so on.



\[ 36:42] So you can customize range to your needs.



\[ 36:47] The one thing you do need to give it is the stop.



\[ 36:50] So if you give it only one value in the parentheses



\[ 36:52] that stands for stop.



\[ 36:55] And by default, start is going to have the value 0,



\[ 36:57] and step is going to have the value 1.



\[ 37:01] If you give it two things in the parentheses,



\[ 37:04] you're giving it start and stop.



\[ 37:06] So the first being start, the second being stop.



\[ 37:08] And step gets this value of 1 by default.



\[ 37:12] And if you give it three things in the parentheses,



\[ 37:15] you're giving it start, stop, and step in that order.



\[ 37:22] And you're always going to start at the start value



\[ 37:26] and stop at-- or so you're going to start at the start value,



\[ 37:30] and you're going to go until stop minus 1.



\[ 37:32] So those are the sequences of numbers.



\[ 37:36] So in this first code right here,



\[ 37:39] my sum is going to get the value 0.



\[ 37:40] And you're going to have a for loop.



\[ 37:44] We're going to start from 7, because we're



\[ 37:46] giving it two numbers.



\[ 37:47] And when you give it two numbers,



\[ 37:49] it represents start and stop with step being 1.



\[ 37:53] So we're starting at 7.



\[ 37:55] If step is 1, the next value is 8.



\[ 38:00] What's the value after that?



\[ 38:05] If we're incrementing by 1?



\[ 38:09] 9.



\[ 38:12] And since we're going until stop minus 1,



\[ 38:17] we're not actually going to pick up on 10.



\[ 38:21] So this loop variable, i, the very first time



\[ 38:23] through the loop is going to have the value 7.



\[ 38:28] So my sum is going to be 0 plus 7.



\[ 38:37] That's everything that's inside the code block.



\[ 38:40] The next time through the loop, i gets the value 8.



\[ 38:45] So inside the for loop, my sum gets



\[ 38:52] whatever the previous value was, which was 7, plus 8.



\[ 38:58] OK.



\[ 39:00] The next time through the loop, my sum



\[ 39:04] get the value 7 plus 8 plus 9.



\[ 39:08] Obviously, replacing that with the previous value.



\[ 39:10] So 15.



\[ 39:13] Since we're not going through 10, that's where we stop.



\[ 39:15] And we're going to print out my sum, which



\[ 39:17] is going to be the value of 7 plus 8 plus 9.



\[ 39:22] Yeah?



\[ 39:24] OK.



\[ 39:25] Yeah.



\[ 39:26] AUDIENCE: \[INAUDIBLE]



\[ 39:27] PROFESSOR: Do they have to be integers?



\[ 39:32] That's a great question.



\[ 39:33] We can try that out.



\[ 39:34] I'm not actually sure right off the top of my head.



\[ 39:38] So you can go on Spider and say-- let's say in this example



\[ 39:46] here.



\[ 39:52] So we can say 7.1, 10.3-- yeah.



\[ 39:58] So they have to be integers.



\[ 40:08] OK.



\[ 40:09] So that's that example.



\[ 40:10] And let's erase that.



\[ 40:13] In this particular example, we have start, stop, and step.



\[ 40:16] And here, we're going every other value.



\[ 40:20] So we're starting at 5.



\[ 40:22] Tell me what the next value is supposed to be.



\[ 40:25] If we're taking every other one.



\[ 40:27] 7, and then 9, and then-- are we doing 11 or not?



\[ 40:35] Excellent.



\[ 40:35] Nice.



\[ 40:36] Yeah.



\[ 40:37] So we're going to the end minus 1.



\[ 40:41] OK.



\[ 40:41] So it's possible that sometimes you



\[ 40:43] write code where you might want to exit out of the loop early.



\[ 40:47] You don't want to go through all of the sequences



\[ 40:49] of your numbers.



\[ 40:51] Maybe there's a condition inside there where you just



\[ 40:53] want to exit the loop early.



\[ 40:55] Inside the while loop, maybe you want



\[ 40:56] to exit the loop before the condition becomes false.



\[ 41:00] So that's where the break statement comes in.



\[ 41:02] So the break works like this.



\[ 41:06] It's going to-- as soon as Python sees this break



\[ 41:09] statement, it's going to say, OK,



\[ 41:13] I'm going to look at whatever loop I'm currently in.



\[ 41:18] I'm not evaluating any expression



\[ 41:20] after it that comes within my loop.



\[ 41:23] And I'm going to immediately exit the loop.



\[ 41:26] So I'm going inside this while, this while,



\[ 41:28] I'm evaluating this one expression,



\[ 41:30] and I suddenly see a break.



\[ 41:33] Expression b does not get evaluated.



\[ 41:37] And break is going to immediately



\[ 41:39] exit out of the innermost loop that it's in.



\[ 41:43] So this while loop that has condition 2, that's



\[ 41:46] the innermost loop that the break is found in.



\[ 41:50] So we're going to exit out of this inner most loop here.



\[ 41:54] And we're evaluating expression c.



\[ 41:57] And notice, we're evaluating expression c,



\[ 41:58] because it's-- expression c is part of the outer while loop.



\[ 42:05] It's at the same level as this one.



\[ 42:08] And these ones are part of the inner while loop.



\[ 42:13] OK.



\[ 42:14] Last thing I want to say is just a little bit



\[ 42:16] of a comparison between for and while loops.



\[ 42:18] So when would you use one or the other.



\[ 42:21] This might be useful in your problem sets.



\[ 42:23] So for loops you usually use when you



\[ 42:24] know the number of iterations.



\[ 42:27] While loops are very useful when, for example, you're



\[ 42:29] getting user input, and user input is unpredictable.



\[ 42:32] You don't know how many times they're



\[ 42:33] going to do a certain task.



\[ 42:36] For both for and while loops, you



\[ 42:38] can end out of the loop early using the break.



\[ 42:40] The for loop uses this counter.



\[ 42:42] It's inherent inside the for loop.



\[ 42:45] A while loop you can use a counter in order-- you can use



\[ 42:48] a while loop to count things.



\[ 42:50] But you must initialize the counter before the while loop.



\[ 42:53] And you have to remember to increment it within the loop.



\[ 42:56] Otherwise, you maybe lead to an infinite loop.



\[ 43:00] We've seen as the very first example of a for loop



\[ 43:04] that the while-- the for loop could



\[ 43:06] be rewritten as a while loop, but the vice versa



\[ 43:08] is not necessarily true.



\[ 43:11] And the counterexample to that is just user input.



\[ 43:14] So you might not know how many times



\[ 43:16] you might do a certain task.



\[ 43:18] All right.



\[ 43:19] Great.



\[ 43:20] That's all for today.


